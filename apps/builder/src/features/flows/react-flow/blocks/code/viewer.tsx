import type { CodeBlockSchema } from "./schema"

export const CodeBlockViewer = ({ data }: { data: CodeBlockSchema }) => {
  return <code className="break-words whitespace-pre-line">{data.code}</code>
}
