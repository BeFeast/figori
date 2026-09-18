# Site publication and release links

Figori uses a static Cloudflare Pages deployment of `site/`, with no build step, analytics, remote fonts or client-side dependencies. Forgejo is canonical; GitHub is the public downstream source/download surface. Website publication does not build, publish or install the application.

## Separate site and application revisions

Record SITE_SHA (deployed static tree), SOURCE_COMMIT (each application's build receipt), and the version for each platform independently. Desktop runtime currently lives on `feat/standalone-desktop`; `main` can contain newer website changes without the runtime. Never overwrite production with the desktop branch's older site merely because its application version is newer. Inspect `git show origin/main:site/index.html` first.

Use a dedicated clean checkout on the approved execution surface. Do not reset another operator's checkout. Set SITE_SHA to an approved full commit:

```bash
set -euo pipefail
: "${SITE_SHA:?Set the approved site commit}"
git fetch origin --tags
git status --short --branch
test -z "$(git status --porcelain)"
git checkout --detach "$SITE_SHA"
test "$(git rev-parse HEAD)" = "$SITE_SHA"
```

## Download changes

Update `site/index.html` on the site branch/worktree, retaining unrelated platform cards. Match every button's version, architecture, format and tagged installation guide to an existing immutable public asset. Root workspace package version is not the desktop release version.

| Delivery | Asset pattern |
| --- | --- |
| macOS Apple silicon | `Figori-VERSION-macos-arm64.dmg` |
| Ubuntu amd64 | `Figori-VERSION-linux-amd64.deb` |
| Fedora x86_64 | `Figori-VERSION-linux-x86_64.rpm` |
| Omarchy/Arch user archive | `Figori-VERSION-linux-x86_64.tar.gz` |

A newer Linux release does not establish a new Mac release. AppImage remains deferred. Public source is not a license grant. Use [macOS signing](macos-signing.md), [Linux packages](linux-packages.md) and [user archive installation](linux-install.md) for platform requirements.

Verify public downloads independently of authenticated API success. First inspect the release asset list and select the receipt names belonging to the chosen platform. A multi-platform release can have separate MACOS or OMARCHY receipt names; never assume generic SHA256SUMS/PACKAGING_STATUS describes a Mac DMG. Set VERSION (without v), ASSET, CHECKSUM_ASSET, STATUS_ASSET and SOURCE_ASSET to the exact published basenames. Select a checksum manifest containing that asset and its matching source receipt. Missing assets, a missing manifest entry, or ambiguous platform/source correspondence block publication verification; do not substitute another platform’s generic receipt:

```bash
: "${VERSION:?Set release version}"
: "${ASSET:?Set exact asset basename}"
: "${CHECKSUM_ASSET:?Set platform checksum manifest basename}"
: "${STATUS_ASSET:?Set platform packaging receipt basename}"
: "${SOURCE_ASSET:?Set matching source receipt basename}"
receipt_dir=$(mktemp -d)
base="https://github.com/BeFeast/figori/releases/download/v$VERSION"
for name in "$ASSET" "$SOURCE_ASSET" "$STATUS_ASSET" "$CHECKSUM_ASSET"; do
  curl --fail --location --silent --show-error "$base/$name" -o "$receipt_dir/$name"
done
(
  cd "$receipt_dir"
  awk -v asset="$ASSET" '$2 == asset { print; found=1 } END { if (!found) exit 1 }' "$CHECKSUM_ASSET" > asset.sha256
  sha256sum --check asset.sha256
)
```

Compare the selected source receipt with the approved runtime SHA for that platform and resolve the release tag on both Forgejo and GitHub. Read acceptance receipts before claiming signed/notarized, tested distributions or Wayland acceptance. Hashes prove identity, not correctness. Never replace published assets or move their tags to repair links.

## CSS cache identity

Every change to `site/style.css` must update the stylesheet href in `site/index.html` to include its new content hash, for example `style.css?v=CONTENT_SHA256`. Compute the hash after the final CSS edit (`sha256sum site/style.css` on Linux); commit the CSS and HTML reference together. A previous unchanged href left returning browsers on old CSS for approximately four hours despite a successful Pages deployment. Do not rely on a hard refresh or an incognito session as the fix.

After deployment, verify the exact hash-bearing CSS URL and test an ordinary reload in a browser that previously visited the site. Both a fresh browser and that returning browser must render the new layout correctly. Record the href/hash in the site receipt.

## Screenshots and examples

`site/assets/project-quote.jpg`, `trip-budget.jpg` and `calendar-plan.jpg` are actual native macOS 0.3.6 captures. Project/trip are 1405×768, calendar 1404×768; project Dark, others Light. Preserve that provenance until actual new captures replace them; these are not Linux screenshots.

Use only public synthetic worksheets in `site/examples/`. Capture through the authorized UI workflow, inspect every displayed result and check the final image for private content. Never substitute mock app UI or personal worksheets/recovery state.

The verifier imports shared core/document code, so run in the approved runtime checkout containing those packages and the candidate examples:

```bash
bun install --frozen-lockfile
bun site/verify-examples.ts
```

Expected successful counts: trip-budget 12, consulting-project 15, calendar-plan 10. Fixed context is 2027-01-15; EUR-base USD 1.10 / ILS 4 rates are explicitly synthetic. Native screenshots may use different dated real rates. Keep `verification.json` and copy accurate; the verifier does not regenerate that file.

Review desktop/mobile widths in a real browser: cards, image loading, overflow, keyboard focus, contrast and link destinations. Any temporary static preview server must use the intended local interface and be stopped afterward.

## Cloudflare deployment

Existing Pages project `figori`, production branch `main`, custom domain `figori.befeast.com`, Pages hostname `figori.pages.dev`. Static root is `site/`. Preserve `_headers`: examples are UTF-8 plain-text attachments with nosniff.

The operator supplies process-only CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_EMAIL and CLOUDFLARE_API_KEY (Global API Key, per existing account policy) through the approved secret store. The previously used `cf-env` helper is environment-specific and **not shipped in this repository**. Never assume it exists on another machine, print credentials, persist them in dotfiles/source, or create replacement credentials as a workaround.

Wrangler 4.134.0 is the historically validated version used for these deployments, not a claim that it is the latest release. Verify the invoked version and record it; changing the pin requires a separate successful deployment check.

After review and release-link verification:

```bash
: "${CLOUDFLARE_ACCOUNT_ID:?Load approved account context}"
: "${CLOUDFLARE_EMAIL:?Load approved account context}"
: "${CLOUDFLARE_API_KEY:?Load approved secret store value}"
unset CLOUDFLARE_API_TOKEN CF_API_TOKEN
test "$(git rev-parse HEAD)" = "$SITE_SHA"
test -z "$(git status --porcelain)"
bunx wrangler@4.134.0 --version
bunx wrangler@4.134.0 pages deploy site \
  --project-name figori --branch main --commit-hash "$SITE_SHA"
bunx wrangler@4.134.0 pages deployment list --project-name figori
```

Use ordinary `bunx` and Wrangler's supported Node runtime. The initial forced `--bun` attempt exited during upload without completed deployment. Uploaded assets alone are not completion. The deployment host needs the supported runtime available; this recipe does not authorize host tool installation.

Record successful production deployment ID/URL and SITE_SHA. Read back its commit/status and custom-domain health through Pages using existing account access; never expose auth headers in public receipts.

## Public verification and rollback

Verify HTTPS and compare public bytes with the committed site, not just status200:

```bash
public_dir=$(mktemp -d)
for relative in index.html style.css assets/figori-mark.svg \
  assets/project-quote.jpg assets/trip-budget.jpg assets/calendar-plan.jpg \
  examples/consulting-project.figori examples/trip-budget.figori examples/calendar-plan.figori; do
  mkdir -p "$public_dir/$(dirname "$relative")"
  curl --fail --location --silent --show-error \
    "https://figori.befeast.com/$relative" -o "$public_dir/$relative"
  cmp "site/$relative" "$public_dir/$relative"
done
curl --fail --silent --show-error --head \
  https://figori.befeast.com/examples/trip-budget.figori
```

Also fetch the exact hash-bearing stylesheet URL referenced by the deployed HTML and compare it with `site/style.css`; a plain /style.css fetch alone does not verify browser cache identity. Confirm example content type/disposition and browser rendering, including new download links and an ordinary reload in a returning browser. Unexpected cached bytes require investigation, not a global cache purge.

Rollback by selecting a previously verified successful production deployment in Pages, or redeploy that exact older static tree from a separate clean checkout, recording its original SITE_SHA. Leave application tags/assets untouched.

Keep a sanitized receipt: site SHA, deployment ID, public asset hashes, platform versions/runtime SHAs and browser acceptance limits. Credentials, private host paths and execution-host inventory belong in private operator context.

## Reusable scripts and historical helpers

Committed entrypoints: `scripts/package-macos-dmg.sh`, `scripts/build-linux-packages.sh`, `scripts/test-linux-packages.sh`, `scripts/package-linux-desktop.sh`, and manual `.forgejo/workflows/linux-packages.yml`. Follow their platform runbooks.

Historical release-upload helpers under temporary directories were session tools, not repository APIs. Reconstruct an uploader from [the immutable publication sequence](desktop-release.md), or add a reviewed reusable script; do not treat ephemeral filenames as available commands. Use strict asset allowlists and verify anonymous downloads after publication.

