# Figori product site

Static Cloudflare Pages directory; publish `site/` with no build command. No analytics, remote fonts, cookies, or client-side dependencies.

Actual native v0.3.6 captures are included at `assets/project-quote.jpg`, `assets/trip-budget.jpg`, and `assets/calendar-plan.jpg`. Project and trip captures are 1405×768; calendar is 1404×768. Consulting uses Dark; trip and calendar use Light. Images remain unedited. Never substitute mock app UI or private worksheets. Confirm the v0.3.6 GitHub DMG URL exists and matches the signed/notarized release.

Public synthetic `.figori` examples live in `examples/`. `verification.json` records shared-engine results with fixed UTC context and explicitly synthetic EUR-base rates (USD 1.10, ILS 4). The installed app uses its own dated rate snapshot, so currency conversion values in native screenshots can differ; do not present the fixture rates as live rates.

Preview with any static server rooted here. Deployment is separate from source changes; verify desktop/mobile rendering, image loading, keyboard focus and download destination before promoting production. Development remains on Forgejo; GitHub is the public downstream source/release surface.

## Production deployment

Cloudflare Pages project: `figori`, production branch `main`, account `9fab831a1b5e10db0fe6e437c3e2175e`. Custom domain `figori.befeast.com` points to `figori.pages.dev`. Use the existing process-only Global API Key credentials from Infisical via `cf-env`; unset scoped token variables before Wrangler.

From the authoritative main checkout, deploy with `bunx wrangler@4.134.0 pages deploy site --project-name figori --branch main --commit-hash "$(git rev-parse HEAD)"`. Use normal `bunx` (Wrangler's supported Node runtime); forcing `--bun` exited during asset upload without a completed deployment in the initial verification.

Read back the successful deployment and custom-domain status. Verify HTTPS, all three screenshot assets, downloadable examples and the actual release checksum. For rollback, select a prior successful production deployment in Pages, or redeploy the previously verified static tree with its original source revision; do not move git tags or overwrite release assets.

Stylesheet links include a content-hash query version. When changing style.css, update that version from its SHA256 so returning browsers do not reuse the previous four-hour cached stylesheet.
