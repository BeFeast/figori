use crate::files::{atomic_write, read_source};
use chrono::{NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, path::Path};

// Every quote ECB publishes against ILS; keep in sync with `currencyCodes` in packages/core.
const QUOTES: [&str; 29] = [
    "AUD", "BRL", "CAD", "CHF", "CNY", "CZK", "DKK", "EUR", "GBP", "HKD", "HUF", "IDR", "INR",
    "ISK", "JPY", "KRW", "MXN", "MYR", "NOK", "NZD", "PHP", "PLN", "RON", "SEK", "SGD", "THB",
    "TRY", "USD", "ZAR",
];
fn endpoint() -> String {
    format!(
        "https://api.frankfurter.dev/v2/providers/ecb/rates?base=ils&quotes={}",
        QUOTES.join(",").to_lowercase()
    )
}
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
    if !snapshot.rates.contains_key("USD") {
        return Err("Missing USD rate".into());
    }
    let valid_rates = snapshot.rates.values().all(|value| {
        value
            .parse::<f64>()
            .is_ok_and(|rate| rate.is_finite() && rate > 0.0)
    });
    let incomplete = QUOTES
        .iter()
        .any(|code| !snapshot.rates.contains_key(*code));
    if snapshot.base != "ILS"
        || !valid_rates
        || date > today
        || snapshot.source != "ECB via Frankfurter"
    {
        return Err("Invalid exchange-rate snapshot".into());
    }
    let status = if incomplete || today.signed_duration_since(date).num_days() > 3 {
        "stale"
    } else {
        "fresh"
    };
    Ok(RateState {
        status: status.into(),
        snapshot: Some(snapshot),
        error: incomplete.then(|| "Cached rates do not include all supported currencies. Refresh explicitly when online.".into()),
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
    let response: Vec<ProviderRate> = serde_json::from_str(text).map_err(|e| e.to_string())?;
    let date = response
        .first()
        .ok_or("Empty exchange-rate response")?
        .date
        .clone();
    let mut rates = BTreeMap::new();
    for row in response {
        let quote = row.quote.to_uppercase();
        if row.base.to_uppercase() != "ILS"
            || !QUOTES.contains(&quote.as_str())
            || row.date != date
            || rates.insert(quote, row.rate.to_string()).is_some()
        {
            return Err("Unexpected, duplicate, or inconsistent exchange-rate pair".into());
        }
    }
    if ["USD", "EUR", "GBP"]
        .iter()
        .any(|code| !rates.contains_key(*code))
    {
        return Err("Incomplete exchange-rate response".into());
    }
    qualify(
        Snapshot {
            base: "ILS".into(),
            rates,
            source: "ECB via Frankfurter".into(),
            as_of: date,
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
            .get(endpoint())
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
    fn row(quote: &str, rate: &str) -> String {
        format!(r#"{{"date":"2026-09-16","base":"ILS","quote":"{quote}","rate":{rate}}}"#)
    }
    fn legacy_fixture() -> String {
        format!(
            "[{},{},{}]",
            row("USD", "0.3299"),
            row("EUR", "0.287"),
            row("GBP", "0.247")
        )
    }
    fn fixture() -> String {
        let rows: Vec<String> = QUOTES
            .iter()
            .map(|quote| match *quote {
                "USD" => row(quote, "0.3299"),
                "EUR" => row(quote, "0.287"),
                "GBP" => row(quote, "0.247"),
                "PLN" => row(quote, "1.2085"),
                _ => row(quote, "2.5"),
            })
            .collect();
        format!("[{}]", rows.join(","))
    }
    #[test]
    fn provider_batch_validates_amounts_pairs_and_one_publication_date() {
        let today = NaiveDate::from_ymd_opt(2026, 9, 17).unwrap();
        let good = parse_provider(&fixture(), today).unwrap();
        assert_eq!(good.status, "fresh");
        let snapshot = good.snapshot.unwrap();
        assert_eq!(snapshot.rates["USD"], "0.3299");
        assert_eq!(snapshot.rates["EUR"], "0.287");
        assert_eq!(snapshot.rates["GBP"], "0.247");
        assert_eq!(snapshot.rates["PLN"], "1.2085");
        assert_eq!(snapshot.rates.len(), QUOTES.len());
        for text in [
            fixture().replace("2026-09-16", "2026-09-18"),
            fixture().replacen("2026-09-16", "2026-09-15", 1),
            fixture().replace("ILS", "EUR"),
            fixture().replace("0.287", "-1"),
            fixture().replace("GBP", "EUR"),
            fixture().replace("GBP", "ABC"),
            "[]".into(),
            r#"[{"date":"2026-09-16","base":"ILS","quote":"USD","rate":0.3}]"#.into(),
        ] {
            assert!(parse_provider(&text, today).is_err(), "{text}");
        }
        assert_eq!(
            parse_provider(&fixture().replace("2026-09-16", "2026-09-01"), today)
                .unwrap()
                .status,
            "stale"
        );
    }
    #[test]
    fn response_without_newer_currencies_is_usable_but_stale_with_refresh_hint() {
        let today = NaiveDate::from_ymd_opt(2026, 9, 17).unwrap();
        let state = parse_provider(&legacy_fixture(), today).unwrap();
        assert_eq!(state.status, "stale");
        assert!(state.error.unwrap().contains("Refresh"));
        assert!(!state.snapshot.unwrap().rates.contains_key("PLN"));
    }
    #[test]
    fn endpoint_requests_every_supported_quote() {
        let url = endpoint();
        assert!(url.contains("base=ils&"));
        assert!(url.contains("pln") && url.contains("chf") && url.contains("usd"));
        assert!(!url.contains("quotes=ils") && !url.contains(",ils"));
    }
    #[test]
    fn legacy_usd_cache_is_retained_with_refresh_hint_and_added_rates_are_validated() {
        let dir = tempfile::tempdir().unwrap();
        let legacy = Snapshot {
            base: "ILS".into(),
            rates: BTreeMap::from([("USD".into(), "0.3".into())]),
            source: "ECB via Frankfurter".into(),
            as_of: Utc::now().date_naive().to_string(),
        };
        std::fs::write(
            dir.path().join("rates.json"),
            serde_json::to_string(&legacy).unwrap(),
        )
        .unwrap();
        let loaded = load(dir.path());
        assert_eq!(loaded.status, "stale");
        assert!(loaded.error.unwrap().contains("Refresh"));
        assert_eq!(loaded.snapshot.unwrap().rates["USD"], "0.3");
        for bad in ["NaN", "inf", "-0.2", "0", "garbage"] {
            let mut invalid = legacy.clone();
            invalid.rates.insert("EUR".into(), bad.into());
            assert!(qualify(invalid, Utc::now().date_naive()).is_err());
        }
    }
}
