import type { ImageBlockSchema } from "./schema"

export const ImageBlockViewer = ({ data }: { data: ImageBlockSchema }) => {
  return (
    <>
      <img
        src={data.url}
        alt={data.id}
        className="w-full h-full object-contain"
      />
    </>
  )
}
