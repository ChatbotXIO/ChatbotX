import { PackageSearch } from "lucide-react"
import Image from "next/image"

/**
 * A product's image, or a placeholder icon when it has none. `className` sets
 * its size and shape; the default is the small square pickers show.
 */
export function ProductThumbnail({
  imageUrl,
  className = "size-6 rounded",
}: {
  imageUrl: string | null
  className?: string
}) {
  if (!imageUrl) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center bg-muted text-muted-foreground ${className}`}
      >
        <PackageSearch aria-hidden className="size-4" />
      </div>
    )
  }
  return (
    <Image
      alt=""
      className={`shrink-0 object-cover ${className}`}
      height={64}
      src={imageUrl}
      width={64}
    />
  )
}
