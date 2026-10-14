import type { MiniAppImageItem } from "@chatbotx.io/mini-app"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { toImageSrc } from "../../lib/image-src"
import { readArray, readString } from "../../lib/props"
import { ImageCarouselView } from "../image-carousel-view"
import type { NodeView } from "./context"

const IMAGE_DEFAULT_HEIGHT = 120
const IMAGE_WIDTH = 360

export function ImageView({ view }: { view: NodeView }) {
  const { props } = view
  const src = toImageSrc(props.src)
  const height = typeof props.height === "number" ? props.height : undefined
  return src ? (
    // biome-ignore lint/performance/noImgElement: inline base64 from Flow JSON
    <img
      alt={readString(props["alt-text"])}
      className={cn(
        "w-full rounded-md",
        props["scale-type"] === "cover" ? "object-cover" : "object-contain",
      )}
      height={height ?? IMAGE_DEFAULT_HEIGHT}
      src={src}
      style={{ height }}
      width={IMAGE_WIDTH}
    />
  ) : null
}

export function CarouselView({ view }: { view: NodeView }) {
  return (
    <ImageCarouselView
      images={readArray<MiniAppImageItem>(view.props.images)}
      scaleType={view.props["scale-type"]}
    />
  )
}
