# Figori product site

Static Cloudflare Pages directory; publish `site/` with no build command. No analytics, remote fonts, cookies, or client-side dependencies.

Actual native v0.3.6 captures are included at `assets/project-quote.jpg`, `assets/trip-budget.jpg`, and `assets/calendar-plan.jpg`. Project and trip captures are 1405×768; calendar is 1404×768. Consulting uses Dark; trip and calendar use Light. Images remain unedited. Never substitute mock app UI or private worksheets. Confirm the v0.3.6 GitHub DMG URL exists and matches the signed/notarized release.

Public synthetic `.figori` examples live in `examples/`. `verification.json` records shared-engine results with fixed UTC context and explicitly synthetic EUR-base rates (USD 1.10, ILS 4). The installed app uses its own dated rate snapshot, so currency conversion values in native screenshots can differ; do not present the fixture rates as live rates.

Preview with any static server rooted here. Deployment is separate from source changes; verify desktop/mobile rendering, image loading, keyboard focus and download destination before promoting production. Development remains on Forgejo; GitHub is the public downstream source/release surface.
