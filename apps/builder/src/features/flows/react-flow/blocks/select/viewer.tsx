import { Label } from "@/components/ui/label"
import type { SelectBlockSchema } from "./schema"

export const SelectBlockViewer = ({ data }: { data: SelectBlockSchema }) => {
  return (
    <>
      {data.label ? <Label>{data.label}</Label> : ""}
      <p>{data.selected}</p>
    </>
  )
}
