import type { TextBlockSchema } from "./schema"

export const TextBlockViewer = ({ data }: { data: TextBlockSchema }) => {
  return <p className="break-words whitespace-pre-line">{data.text}</p>
}
