# Figori identity

**Figori — Your numbers, in context.**

The folded-worksheet F and Figori name remain the product identity. On 2026-09-17,
the user requested HedRoom's visual direction: charcoal surfaces, warm off-white
text and three red accent levels replace the original cobalt/lime palette.
The three-path vector geometry is unchanged.

## Palette and provenance

Tokens were checked against HedRoom's [brand guide](https://git.oklabs.uk/BeFeast/hedroom/src/commit/dec56d1f74e2bd91c9e76f796ca4d2d2e82a167c/design/brand/BRAND.md),
[brand sheet](https://git.oklabs.uk/BeFeast/hedroom/src/commit/dec56d1f74e2bd91c9e76f796ca4d2d2e82a167c/design/brand/brand-sheet.html)
and [product CSS](https://git.oklabs.uk/BeFeast/hedroom/src/commit/dec56d1f74e2bd91c9e76f796ca4d2d2e82a167c/apps/web/src/app/globals.css).
Figori adopts the palette, not HedRoom's ring-and-dot mark.

| Token | Color | Role |
| --- | --- | --- |
| bg | `#0b0c0d` | Charcoal canvas |
| surface | `#141618` | Raised surface |
| raised | `#1c1f21` | Higher surface / hover |
| recessed | `#101112` | Input wells |
| tint | `#15100f` | Warm surface |
| ac | `#b8443c` | Borders, decorative marks; not small text |
| ac2 | `#d9776d` | Accent labels |
| ac3 | `#e59c92` | Bright accent / numeric emphasis |
| text | `#e8e6e3` | Warm off-white body text |

Against bg, ac is about 3.7:1, ac2 6.4:1, ac3 8.9:1 and text 15.7:1.
Use ac2/ac3 for text; ac is decorative or a non-text boundary.
Selection and errors also need words or shape cues. HedRoom defines no light
theme; Figori's retained light asset is a compatibility presentation, not a
claim that the dark palette can be inverted for accessible UI.

Machine-readable source: [palette.json](../assets/brand/palette.json).

## Assets and compatibility filenames

[figori-mark.svg](../assets/brand/figori-mark.svg) is the primary deep-red F with
the brighter middle arm. Monochrome/inverse variants use charcoal/off-white.
[figori-app.svg](../assets/brand/figori-app.svg) places it on a charcoal tile and
is the canonical desktop app icon source. SVG wordmarks and lockups remain
outlined, portable artwork. App PNG sizes 16/32/64/128/256/512 live in
[icons](../assets/brand/icons); [social preview](../assets/brand/figori-social.png)
is 1200×630.

Legacy filenames `figori-mark-lime.svg`, `figori-app-cobalt.svg` and
`figori-cobalt-512.png` are retained for consumers: their colors now follow the
HedRoom palette. The former lime mark is ac3; the former cobalt tile is the
raised charcoal surface with an ac3 mark. Filenames do not define active tokens.
Existing installed adapter assets are updated separately, not by editing this
canonical source.

Keep supplied proportions and padding. Do not introduce gradients, beveled folds,
shadows or independent rotations of the F components. Use the symbol alone for
small icons; keep the wordmark legible at larger sizes.

## Typography and native surfaces

Canonical Figori artwork retains outlined Space Grotesk Bold; adopting HedRoom's
palette does not replace the Figori name or glyph. The desktop interface can use
HedRoom's Heebo direction while native Raycast, terminal and Omarchy keep their
platform typography. Preserve Hebrew/Russian fallback and accessibility settings.

Font provenance and notices: [Space Grotesk source](../assets/brand/fonts/SOURCE.md)
and [OFL](../assets/brand/fonts/OFL.txt). IBM Plex Mono remains a marketing numeric
recommendation, not an installed system requirement.

## Regeneration

```sh
bun install --cwd assets/brand --frozen-lockfile
bun run --cwd assets/brand generate
bun run --cwd assets/brand render
```

Bun generates the flat SVG geometry and outlined lettering. The existing
`rsvg-convert` renders PNGs; native icon containers are generated from the same
SVG. No raster recoloring is used. Renderer version changes may alter
antialiasing bytes.

## Naming and Numi acknowledgement

Figori is independent, inspired by [Numi](https://numi.app). Preserve the README's
acknowledgement and original developer support link. Do not imply endorsement
or complete syntax/numerical compatibility.

My Numi is the historical working name. Palette changes do not change evaluator
semantics, .numi bytes, settings identities, data paths or compatibility commands.
