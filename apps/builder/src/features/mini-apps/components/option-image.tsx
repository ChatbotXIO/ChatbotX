import type { MiniAppOption } from "@chatbotx.io/mini-app"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { toImageSrc } from "../lib/image-src"

/** An option's image, or its color swatch when it has a color instead. */
export function OptionImage({
  option,
  size = "md",
}: {
  option: MiniAppOption
  size?: "sm" | "md"
}) {
  const src = toImageSrc(option.image)
  const box = size === "sm" ? "size-6" : "size-10"
  const pixels = size === "sm" ? 24 : 40
  if (src) {
    return (
      // biome-ignore lint/performance/noImgElement: inline base64 from Flow JSON
      <img
        alt={option["alt-text"] ?? ""}
        className={cn(box, "shrink-0 rounded object-cover")}
        height={pixels}
        src={src}
        width={pixels}
      />
    )
  }
  if (option.color) {
    return (
      <span
        className={cn(box, "shrink-0 rounded")}
        style={{ backgroundColor: option.color }}
      />
    )
  }
  return null
}
