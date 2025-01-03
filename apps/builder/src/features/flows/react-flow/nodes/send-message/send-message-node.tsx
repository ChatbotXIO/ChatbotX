import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageCircleMoreIcon } from "lucide-react";
import { FlowFlowNodeToolbar } from "../../toolbars";
import { useState } from "react";

import NodeBlockImage from "../blocks/image";

export default function SendMessageNode({ data, id }: { data: Record<string, any>, id: string | number }) {
  const [openToolbar, onOpenToolbar] = useState(false)

  return (
    <>
      <FlowFlowNodeToolbar visible={openToolbar} />
      <Card className="w-72" onMouseOver={() => onOpenToolbar(true)} onMouseOut={() => onOpenToolbar(false)}>
        <CardHeader className="p-4">
          <CardTitle className="flex gap-1 items-center">
            <MessageCircleMoreIcon size={20} />
            {data?.label}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          {
            data && data?.image.length > 0 ?
              data.image.map((img, idx) => <NodeBlockImage key={idx} nodeId={id} image={img} />) :
              ''
          }
        </CardContent>
      </Card>
    </>
  )
}
