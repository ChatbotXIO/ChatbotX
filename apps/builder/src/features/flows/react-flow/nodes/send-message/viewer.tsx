import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageCircleMoreIcon } from "lucide-react";
import { useState } from "react";
import { FlowFlowNodeToolbar } from "../../toolbars";
import { SendMessageNodeSchema } from "./schema";
import { SendAudioBlockSchema } from "@/features/flows/react-flow/blocks/send-audio/schema";
import { AudioBlockViewer } from "@/features/flows/react-flow/blocks/send-audio/viewer";
import { SendCardBlockSchema } from "@/features/flows/react-flow/blocks/send-card/schema";
import { SendCardBlockViewer } from "@/features/flows/react-flow/blocks/send-card/viewer";
import { SendCarouselBlockSchema } from "@/features/flows/react-flow/blocks/send-carousel/schema";
import { SendCarouselBlockViewer } from "@/features/flows/react-flow/blocks/send-carousel/viewer";
import { SendImageBlockSchema } from "@/features/flows/react-flow/blocks/send-image/schema";
import { SendImageBlockViewer } from "@/features/flows/react-flow/blocks/send-image/viewer";
import { SendTextBlockSchema } from "@/features/flows/react-flow/blocks/send-text/schema";
import { SendTextBlockViewer } from "@/features/flows/react-flow/blocks/send-text/viewer";
import { SendVideoBlockSchema } from "@/features/flows/react-flow/blocks/send-video/schema";
import { SendVideoBlockViewer } from "@/features/flows/react-flow/blocks/send-video/viewer";
import { ActionType } from "../../action-type";

const maps: Record<string, any> = {
  [ActionType.SendText]: (data: SendTextBlockSchema) => (<SendTextBlockViewer key={data.id} data={data} />),
  [ActionType.SendImage]: (data: SendImageBlockSchema) => (<SendImageBlockViewer key={data.id} data={data} />),
  [ActionType.SendCard]: (data: SendCardBlockSchema) => (<SendCardBlockViewer key={data.id} data={data} />),
  [ActionType.SendCarousel]: (data: SendCarouselBlockSchema) => (<SendCarouselBlockViewer key={data.id} data={data} />),
  [ActionType.SendVideo]: (data: SendVideoBlockSchema) => (<SendVideoBlockViewer key={data.id} data={data} />),
  [ActionType.SendAudio]: (data: SendAudioBlockSchema) => (<AudioBlockViewer key={data.id} data={data} />)
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
