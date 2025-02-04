import type { HeadingBlockSchema } from "./schema"

export const HeadingBlockViewer = ({ data }: { data: HeadingBlockSchema }) => {
  return <h2>{data.heading}</h2>
}
