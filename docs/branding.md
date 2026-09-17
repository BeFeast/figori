# Figori identity

**Figori — Your numbers, in context.**

The selected identity combines a folded-worksheet **F**, cobalt, lime, ink and paper. The three-path symbol is flat vector artwork: a vertical fold, a long upper arm and a shorter lime calculation line. Rounded arm ends soften the geometric fold. The primary source is the SVG geometry, not an image-generation reference.

## Palette

| Token | Color | Role |
| --- | --- | --- |
| Cobalt | `#284BFF` | Brand surfaces, emphasis and primary actions |
| Lime | `#DDFC45` | Accent line, high-contrast mark on cobalt, selected highlights |
| Ink | `#111827` | Body text and dark surfaces |
| Paper | `#F7F8FC` | Light canvas and inverse text |

Use ink on paper (16.72:1), paper on cobalt (5.59:1), ink on lime (15.28:1), or lime on cobalt (5.11:1) for text. Ratios use the WCAG sRGB luminance calculation. **Do not use lime text on paper (1.09:1) or cobalt text on ink (2.99:1).** The decorative two-color symbol may sit on paper/ink; it does not replace readable labels or a visible focus indicator. Selection and errors must also have text or shape cues.

Machine-readable tokens: [palette.json](../assets/brand/palette.json).

## Assets

| Asset | Use |
| --- | --- |
| [figori-mark.svg](../assets/brand/figori-mark.svg) | Primary cobalt/lime symbol, transparent canvas |
| [figori-mark-mono.svg](../assets/brand/figori-mark-mono.svg) | One-color ink reproduction |
| [figori-mark-inverse.svg](../assets/brand/figori-mark-inverse.svg) | One-color paper reproduction on dark backgrounds |
| [figori-mark-lime.svg](../assets/brand/figori-mark-lime.svg) | Lime mark on cobalt, including the Omarchy header |
| [figori-app.svg](../assets/brand/figori-app.svg) | Primary two-color symbol on ink app tile |
| [figori-app-cobalt.svg](../assets/brand/figori-app-cobalt.svg) | High-contrast lime symbol on cobalt tile, Raycast variant |
| [figori-app-light.svg](../assets/brand/figori-app-light.svg) | Light-background presentation |
| [figori-wordmark.svg](../assets/brand/figori-wordmark.svg) | Outlined Space Grotesk Bold wordmark |
| [figori-lockup.svg](../assets/brand/figori-lockup.svg) | Horizontal symbol + wordmark |
| [figori-social.png](../assets/brand/figori-social.png) | 1200×630 social preview |

Inverse wordmark/lockup variants accompany the originals. App PNG sizes: **16, 32, 64, 128, 256 and 512 px** in [icons](../assets/brand/icons). The cobalt-tile variant includes a 512 px adapter asset. Use the symbol alone below 96 px; do not squeeze the wordmark into a small icon.

Keep at least one stem-width of space around a placed mark when layout permits. SVG canvases include consistent base padding; preserve their aspect ratio. Do not add gradients, shadows, outlines, beveled folds or independent rotations of the three parts. The social composition can rotate the complete decorative mark as one unit. Use supplied outlines for the wordmark instead of retyping it with a substitute font.

## Typography and native surfaces

- **Display/marketing Latin:** Space Grotesk Bold for names and headlines; regular/medium weights may be used for supporting copy.
- **Numbers/code in designed marketing material:** IBM Plex Mono, with tabular alignment where appropriate.
- **Application UI:** keep native Raycast typography, the configured terminal font and Omarchy/system fonts. Do not require custom font installation, fake a DOM editor in Raycast or override user accessibility settings.
- Preserve Unicode and system fallback fonts for Hebrew/Russian text. Brand fonts are not a reason to replace supported scripts.

The wordmark is outlined from a pinned upstream [Space Grotesk](https://github.com/floriankarsten/space-grotesk) font. Source/notice are in [fonts/SOURCE.md](../assets/brand/fonts/SOURCE.md) and [fonts/OFL.txt](../assets/brand/fonts/OFL.txt). The application does not load this font. [IBM Plex](https://github.com/IBM/plex) is a typography recommendation; no Plex font is bundled or installed.

## Regeneration

Generation is isolated from the application workspace. Bun creates SVGs; librsvg renders the native vector artwork deterministically to PNG:

```sh
bun install --cwd assets/brand --frozen-lockfile
bun run --cwd assets/brand generate
bun run --cwd assets/brand render
```

The renderer command is `rsvg-convert`; changing its version may change antialiasing bytes. The mark has exactly three geometric paths with solid fills. Wordmark/social lettering is converted to paths so output does not depend on fonts installed on the viewing machine.

## Naming and Numi acknowledgement

Figori is independent, inspired by [Numi](https://numi.app). Keep the acknowledgement and original developer support link visible in the README. Never imply affiliation, endorsement, complete syntax compatibility or that Numi is defective because Figori chooses different calendar semantics.

The old My Numi name is historical. Internal compatibility identifiers and existing data paths are intentionally retained by the adapters. Visual branding must not change evaluator behavior, `.numi` source, metadata identity, storage paths or legacy command compatibility. Repository redirects/renames are managed separately from this artwork.
