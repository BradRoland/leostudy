# 180 Academy identity

The website name is **180 Academy**. The refreshed identity combines a geometric A and an arc representing progress. The shared brand component supplies the accessible name and wordmark; decorative instances are hidden from screen readers.

## Logo asset

- Final project asset: [180-academy-mark.png](../public/brand/180-academy-mark.png)
- Generated using the built-in image generation tool, with a transparent background. No fallback CLI or external image API was used.
- Original PNG is preserved at 1254 × 1254 with its alpha channel. The interface uses this asset as a CSS mask to adapt it to light and dark surfaces. The favicon embeds the same unmodified mark on a white rounded square so it remains legible on dark browser tabs; the touch icon also uses the new mark.
- Production components: [AcademyBrand.tsx](../src/components/AcademyBrand.tsx) and [AcademyBrand.css](../src/components/AcademyBrand.css).

### Final generation prompt

Use case: logo-brand. Asset type: production website logomark for the brand 180 Academy. Create one distinctive, professional, compact geometric logo that combines a bold ascending A shape with a single 180-degree arc, suggesting focus, progress, and a fresh perspective. Confident contemporary identity for an academy learning platform. The mark should feel precisely constructed, balanced, instantly recognizable at small app-icon sizes, with broad solid strokes and elegant negative space. Pure solid black ink only on a genuinely transparent background, preserving alpha. Square canvas with the single logo centered and occupying roughly 80 percent of the image. Flat vector-like edges, no gradients, no texture, no shadows, no mockup, no 3D. No police shield, crest, badge, book clipart, stars, or decorative details. No letters or words outside the integrated geometric A, no tagline, no wordmark, no watermark. This is a finished single logo asset, not a concept sheet.

## Colors and interface

| Purpose | Light | Dark |
| --- | --- | --- |
| Canvas | `#f7f8fa` | `#111318` |
| Surface | `#ffffff` | `#1a1d24` |
| Text | `#181c25` | `#f4f5f8` |
| Secondary text | `#697181` | `#a1a7b5` |
| Primary action | `#3159ed` | `#809bff` |
| Borders | `#e4e7ed` | `#303541` |

The default Academy Blue color tokens live in [Professional.css](../src/Professional.css). Components share neutral surfaces, blue actions, consistent line icons, readable labels, visible focus rings, restrained borders, and responsive layouts. Success, warning, and incorrect-answer states retain distinct semantic colors. Reduced-motion preferences are respected.

Existing Supporter theme choices retain their saved identifiers and apply through the same Academy tokens. [academyTheme.ts](../src/lib/academyTheme.ts) connects selected palettes to the refreshed surfaces and chooses contrasting action text. Returning to Academy Blue or losing theme eligibility restores the default palette.

User-facing legacy branding has been replaced. Internal storage keys, repository/package names, deployment identifiers, and historical class labels remain compatible with existing accounts and content.

All implementation and review work remains on `codex/class180-ui-overhaul-test`. This identity has not been published to main or Coolify.
