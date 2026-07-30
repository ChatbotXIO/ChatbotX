/**
 * Meta's own blue. No design token covers a third party's brand colour, so this
 * is the single place in the product screens allowed to name it — the icon and
 * the disc behind it drift apart the moment either one is written inline.
 *
 * Written as whole literal class names on purpose: Tailwind finds classes by
 * scanning source text, so an arbitrary value assembled from a template string
 * would never make it into the generated stylesheet.
 */
export const META_BLUE_TEXT = "text-[#0866FF]"
export const META_BLUE_SURFACE = "bg-[#0866FF]/10"
