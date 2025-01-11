import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { SplitIcon } from "lucide-react"
import { useState } from "react"
import { SplitTrafficBlockViewer } from "../../blocks/split-traffic/viewer"
import { FlowFlowNodeToolbar } from "../../toolbars"
import type { SplitTrafficNodeSchema } from "./schema"

export default function SplitTrafficNodeViewer({
  data,
  id,
}: { data: SplitTrafficNodeSchema; id: string | number }) {
  const [openToolbar, onOpenToolbar] = useState(false)

  return (
    <>
      <FlowFlowNodeToolbar visible={openToolbar} />
      <Card
        className="w-72 hover:border-blue-500"
        onMouseOver={() => onOpenToolbar(true)}
        onMouseOut={() => onOpenToolbar(false)}
      >
        <CardHeader className="p-4">
          <CardTitle className="flex gap-1 items-center">
            <SplitIcon size={20} />
            {data.name}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0 flex flex-col gap-2">
          {data.blocks.map((blockItem) => (
            <SplitTrafficBlockViewer key={blockItem.id} data={blockItem} />
          ))}
        </CardContent>
      </Card>
    </>
  )
}
