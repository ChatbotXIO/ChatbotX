import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageCircleMoreIcon } from "lucide-react";
import { useState } from "react";
import { ActionType } from "../../action-type";
import { SendTextBlockSchema } from "../../blocks/send-text/schema";
import { SendTextBlockViewer } from "../../blocks/send-text/viewer";
import { FlowFlowNodeToolbar } from "../../toolbars";
import { SendMessageNodeSchema } from "./schema";

const maps = {
  [ActionType.SendText]: (data: SendTextBlockSchema) => (<SendTextBlockViewer key={data.id} data={data} />)
}

export default function SendMessageNodeViewer({ data, id }: { data: SendMessageNodeSchema, id: string | number }) {
  const [openToolbar, onOpenToolbar] = useState(false)

  return (
    <>
      <FlowFlowNodeToolbar visible={openToolbar} />
      <Card className="w-72 hover:border-blue-500" onMouseOver={() => onOpenToolbar(true)} onMouseOut={() => onOpenToolbar(false)}>
        <CardHeader className="p-4">
          <CardTitle className="flex gap-1 items-center">
            <MessageCircleMoreIcon size={20} />
            {data.name}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {
            data.blocks.map((blockItem) => blockItem?.actionType ? maps[blockItem?.actionType](blockItem!) : null)
          }
        </CardContent>
      </Card>
    </>
  )
}
