# Figori product site

Static Cloudflare Pages directory; publish `site/` with no build command. No analytics, remote fonts, cookies, or client-side dependencies.

Actual native macOS v0.3.9 captures are included at `assets/project-quote.png`, `assets/trip-budget.png`, and `assets/calendar-plan.png`, taken on 2026-09-18 with the public example worksheets, editor size 22 px, line spacing 1.6×, the results column narrowed to about a quarter of a 1200-pt-wide window. Captured at 2x on the built-in Retina display: project is 2400×1700 px (1200×850 pt) in Dark; trip and calendar are 2400×1500 px (1200×750 pt) in Light. Images are unedited apart from lossless PNG re-encoding (metadata stripped) and a transparent rounded-corner mask inset 3 px (radius 24 px at 2x) that removes the desktop pixels behind macOS's rounded window corners and the window's 2 px edge highlight. Never substitute mock app UI or private worksheets. Confirm the v0.3.9 GitHub DMG URL exists and matches the signed/notarized release.

Public synthetic `.figori` examples live in `examples/`. `verification.json` records shared-engine results with fixed UTC context and explicitly synthetic EUR-base rates (USD 1.10, ILS 4). The installed app uses its own dated rate snapshot, so currency conversion values in native screenshots can differ; do not present the fixture rates as live rates.

Preview with any static server rooted here. Deployment is separate from source changes; verify desktop/mobile rendering, image loading, keyboard focus and download destination before promoting production. Development remains on Forgejo; GitHub is the public downstream source/release surface.

## Production deployment

Set deployment credentials through your hosting provider before publishing the static files.

From the authoritative main checkout, deploy with `bunx wrangler@4.134.0 pages deploy site --project-name figori --branch main --commit-hash "$(git rev-parse HEAD)"`. Use normal `bunx` (Wrangler's supported Node runtime); forcing `--bun` exited during asset upload without a completed deployment in the initial verification.

Read back the successful deployment and custom-domain status. Verify HTTPS, all three screenshot assets, downloadable examples and the actual release checksum. For rollback, select a prior successful production deployment in Pages, or redeploy the previously verified static tree with its original source revision; do not move git tags or overwrite release assets.

Stylesheet links include a content-hash query version. When changing style.css, update that version from its SHA256 so returning browsers do not reuse the previous four-hour cached stylesheet.

Typography: self-hosted Noto Sans (Latin variable subset) in `assets/fonts/`, OFL 1.1; see docs/site-release.md.
