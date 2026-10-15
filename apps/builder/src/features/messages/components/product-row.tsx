import { ProductThumbnail } from "@/features/products/components/product-thumbnail"

/** One product line of a message: image, name, and a line of detail under it. */
export function ProductRow({
  name,
  imageUrl,
  detail,
}: {
  name: string
  imageUrl: string | null
  detail: string
}) {
  return (
    <li className="flex items-center gap-2">
      <ProductThumbnail className="size-10 rounded" imageUrl={imageUrl} />
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-medium text-sm">{name}</span>
        <span className="text-muted-foreground text-xs">{detail}</span>
      </div>
    </li>
  )
}
