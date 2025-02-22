import { BaseHandle } from "@/components/base-handle"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Position } from "@xyflow/react"
import { ClockIcon } from "lucide-react"
import { useState } from "react"
import { WaitBlockViewer } from "../../blocks/wait/viewer"
import { FlowFlowNodeToolbar } from "../../toolbars"
import type { WaitNodeSchema } from "./schema"

export default function WaitNodeViewer({
  data,
  id,
}: { data: WaitNodeSchema["data"]; id: string }) {
  const [openToolbar, onOpenToolbar] = useState(false)

  return (
    <>
      <FlowFlowNodeToolbar visible={openToolbar} />
      <Card
        className="w-72 hover:border-blue-500"
        onMouseOver={() => onOpenToolbar(true)}
        onMouseOut={() => onOpenToolbar(false)}
      >
        <CardHeader className="p-4 border-b-2 border-red-500 relative">
          <BaseHandle id={id} type="target" position={Position.Left} />
          <CardTitle className="flex gap-2 items-center">
            <ClockIcon size={20} className="text-red-500" />
            {data.name}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {data.blocks.map((blockItem) => (
            <WaitBlockViewer
              id={blockItem.id}
              key={blockItem.id}
              data={blockItem}
            />
          ))}
          <div className="w-full text-right relative">
            <span className="mr-4">Continue</span>
            <BaseHandle id={id} type="source" position={Position.Right} />
          </div>
        </CardContent>
      </Card>
    </>
  )
}
