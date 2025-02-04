import { Button } from "@/components/ui/button"
import type { SingleButtonBlockSchema } from "./schema"

export const SingleButtonBlockViewer = ({
  data,
}: {
  data: SingleButtonBlockSchema
}) => {
  return (
    <>
      <Button className="w-full">{data.name}</Button>
    </>
  )
}
