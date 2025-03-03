import { BaseHandle } from "@/components/base-handle"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Position } from "@xyflow/react"
import { ExternalLinkIcon } from "lucide-react"
import { useState } from "react"
import { StartFlowBlockViewer } from "../../blocks/start-flow/viewer"
import { FlowFlowNodeToolbar } from "../../toolbars"
import type { StartFlowNodeSchema } from "./schema"

export default function StartFlowNodeViewer({
  data,
  id,
}: {
  data: StartFlowNodeSchema["data"]
  id: string
}) {
  const [openToolbar, onOpenToolbar] = useState(false)

  return (
    <>
      <FlowFlowNodeToolbar visible={openToolbar} />
      <Card
        className="w-72 hover:border-blue-500"
        onMouseOver={() => onOpenToolbar(true)}
        onMouseOut={() => onOpenToolbar(false)}
      >
        <CardHeader className="p-4 border-b-2 border-purple-200 relative">
          <BaseHandle id={id} type="target" position={Position.Left} />
          <CardTitle className="flex gap-2 items-center">
            <ExternalLinkIcon size={20} className="text-purple-200" />
            {data.name}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          {data.blocks.map((blockItem) => (
            <StartFlowBlockViewer
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
