import { BaseHandle } from "@/components/base-handle"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Handle, Position } from "@xyflow/react"
import { MessageCircleMoreIcon } from "lucide-react"
import { useState } from "react"
import { DynamicBlockViewer } from "../../blocks"
import { FlowFlowNodeToolbar } from "../../toolbars"
import type { SendMessageNodeSchema } from "./schema"

export default function SendMessageNodeViewer({
  data,
  id,
}: {
  data: SendMessageNodeSchema["data"]
  id: string
}) {
  const [openToolbar, onOpenToolbar] = useState(false)

  return (
    <>
      {/* <FlowFlowNodeToolbar visible={openToolbar} /> */}
      <Card
        className="w-72 hover:border-blue-500 bg-white/75"
        onMouseOver={() => onOpenToolbar(true)}
        onMouseOut={() => onOpenToolbar(false)}
      >
        <CardHeader className="p-4 relative">
          <Handle id={id} type="target" position={Position.Left} />
          <CardTitle className="flex gap-1 items-center">
            <MessageCircleMoreIcon size={20} />
            {data.name}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {data.blocks.map((blockItem) => (
            <DynamicBlockViewer
              key={blockItem.id}
              type={blockItem.actionType}
              data={blockItem}
            />
          ))}
          <div className="w-full relative text-right">
            <span className="mr-4">Continue</span>
            <BaseHandle id={id} type="source" position={Position.Right} />
          </div>
        </CardContent>
      </Card>
    </>
  )
}
