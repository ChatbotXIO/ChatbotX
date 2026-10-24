import type { CSSProperties } from "react"
import { readableForeground } from "@/features/integration-webchat/lib/brand-color"

/**
 * The CSS variables that make every primary-colored part of the shop use the
 * workspace's brand color. Set on the shop's wrapper and on anything drawn
 * outside it (the bottom bar is portaled to `<body>`).
 */
export const shopBrandStyle = (brandColor: string): CSSProperties =>
  ({
    "--primary": brandColor,
    "--primary-foreground": readableForeground(brandColor),
    "--ring": brandColor,
  }) as CSSProperties
