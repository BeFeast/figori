use crate::files::{atomic_write, read_source};
use chrono::{NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, path::Path};

const ENDPOINT: &str = "https://api.frankfurter.dev/v2/providers/ecb/rate/ils/usd";
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub base: String,
    pub rates: BTreeMap<String, String>,
    pub source: String,
    pub as_of: String,
}
#[derive(Clone, Debug, Serialize)]
pub struct RateState {
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub snapshot: Option<Snapshot>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}
fn qualify(snapshot: Snapshot, today: NaiveDate) -> Result<RateState, String> {
    let date =
        NaiveDate::parse_from_str(&snapshot.as_of, "%Y-%m-%d").map_err(|_| "Invalid rate date")?;
    let rate = snapshot
        .rates
        .get("USD")
        .and_then(|v| v.parse::<f64>().ok())
        .ok_or("Missing USD rate")?;
    if snapshot.base != "ILS"
        || !rate.is_finite()
        || rate <= 0.0
        || date > today
        || snapshot.source != "ECB via Frankfurter"
    {
        return Err("Invalid exchange-rate snapshot".into());
    }
    let status = if today.signed_duration_since(date).num_days() > 3 {
        "stale"
    } else {
        "fresh"
    };
    Ok(RateState {
        status: status.into(),
        snapshot: Some(snapshot),
        error: None,
    })
}
pub fn load(data: &Path) -> RateState {
    let path = data.join("rates.json");
    let result = read_source(&path)
        .and_then(|text| serde_json::from_str::<Snapshot>(&text).map_err(|e| e.to_string()))
        .and_then(|snapshot| qualify(snapshot, Utc::now().date_naive()));
    result.unwrap_or_else(|error| RateState {
        status: "unavailable".into(),
        snapshot: None,
        error: Some(if path.exists() {
            error
        } else {
            "No cached exchange rate. Refresh explicitly when online.".into()
        }),
    })
}
#[derive(Deserialize)]
struct ProviderRate {
    date: String,
    base: String,
    quote: String,
    rate: serde_json::Number,
}
fn parse_provider(text: &str, today: NaiveDate) -> Result<RateState, String> {
    let response: ProviderRate = serde_json::from_str(text).map_err(|e| e.to_string())?;
    if response.base.to_uppercase() != "ILS" || response.quote.to_uppercase() != "USD" {
        return Err("Unexpected exchange-rate pair".into());
    }
    qualify(
        Snapshot {
            base: "ILS".into(),
            rates: BTreeMap::from([("USD".into(), response.rate.to_string())]),
            source: "ECB via Frankfurter".into(),
            as_of: response.date,
        },
        today,
    )
}
pub async fn refresh(data: &Path) -> RateState {
    let mut previous = load(data);
    let result = async {
        let response = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(12))
            .build()
            .map_err(|e| e.to_string())?
            .get(ENDPOINT)
            .send()
            .await
            .map_err(|e| e.to_string())?
            .error_for_status()
            .map_err(|e| e.to_string())?;
        if response.content_length().unwrap_or(0) > 65536 {
            return Err("Oversized rate response".to_string());
        }
        let text = response.text().await.map_err(|e| e.to_string())?;
        if text.len() > 65536 {
            return Err("Oversized rate response".into());
        }
        let state = parse_provider(&text, Utc::now().date_naive())?;
        let snapshot = state.snapshot.as_ref().ok_or("Missing provider rate")?;
        if previous
            .snapshot
            .as_ref()
            .is_some_and(|old| old.as_of > snapshot.as_of)
        {
            return Err(
                "Provider returned an older rate; retaining the newer cached snapshot.".into(),
            );
        }
        let mut state = state;
        if let Err(error) = atomic_write(
            &data.join("rates.json"),
            serde_json::to_string(&state.snapshot).unwrap().as_bytes(),
            None,
            false,
        ) {
            state.error = Some(format!(
                "Rate fetched but cache could not be saved: {error}"
            ));
        }
        Ok(state)
    }
    .await;
    match result {
        Ok(state) => state,
        Err(error) => {
            previous.error = Some(error);
            previous
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn provider_pair_date_and_amount_are_validated_without_network() {
        let today = NaiveDate::from_ymd_opt(2026, 9, 17).unwrap();
        let good = parse_provider(
            r#"{"date":"2026-09-16","base":"ILS","quote":"USD","rate":0.3299}"#,
            today,
        )
        .unwrap();
        assert_eq!(good.status, "fresh");
        assert_eq!(good.snapshot.unwrap().rates["USD"], "0.3299");
        for text in [
            r#"{"date":"2026-09-18","base":"ILS","quote":"USD","rate":0.3}"#,
            r#"{"date":"2026-09-16","base":"EUR","quote":"USD","rate":0.3}"#,
            r#"{"date":"2026-09-16","base":"ILS","quote":"USD","rate":-1}"#,
        ] {
            assert!(parse_provider(text, today).is_err());
        }
        assert_eq!(
            parse_provider(
                r#"{"date":"2026-09-01","base":"ILS","quote":"USD","rate":0.3}"#,
                today
            )
            .unwrap()
            .status,
            "stale"
        );
    }
}
