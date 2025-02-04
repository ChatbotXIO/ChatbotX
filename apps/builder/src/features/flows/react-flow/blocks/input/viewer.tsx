import { Label } from "@/components/ui/label"
import type { InputBlockSchema } from "./schema"

export const InputBlockViewer = ({ data }: { data: InputBlockSchema }) => {
  return (
    <>
      {data.label ? <Label>{data.label}</Label> : ""}
      <p>{data.input}</p>
    </>
  )
}
