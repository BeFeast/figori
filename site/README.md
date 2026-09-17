# Figori product site

Static Cloudflare Pages directory; publish `site/` with no build command. No analytics, remote fonts, cookies, or client-side dependencies.

Before publication, supply actual native app captures at `assets/project-quote.png`, `assets/trip-budget.png`, and `assets/calendar-plan.png`. The supplied 1200×850 image dimensions should match capture aspect ratio. Never substitute mock app UI or private worksheets. Confirm the v0.3.5 GitHub DMG URL exists and matches the signed/notarized release.

Public synthetic `.figori` examples live in `examples/`. `verification.json` records shared-engine results with fixed UTC context and explicitly synthetic EUR-base rates (USD 1.10, ILS 4). The installed app uses its own dated rate snapshot, so currency conversion values in native screenshots can differ; do not present the fixture rates as live rates.

Preview with any static server rooted here. Deployment is separate from source changes; verify desktop/mobile rendering, image loading, keyboard focus and download destination before promoting production. Development remains on Forgejo; GitHub is the public downstream source/release surface.
