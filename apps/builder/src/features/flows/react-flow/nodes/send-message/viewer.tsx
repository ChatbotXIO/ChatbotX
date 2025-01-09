import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BlockType } from "@/features/flows/react-flow/blocks/types";
import { MessageCircleMoreIcon } from "lucide-react";
import { useState } from "react";
import { FlowFlowNodeToolbar } from "../../toolbars";
import { SendMessageNodeSchema } from "./schema";

import type { TextBlockSchema } from "@/features/flows/react-flow/blocks/text/schema";
import { TextBlockViewer } from "@/features/flows/react-flow/blocks/text/viewer";
import type { CardBlockSchema } from "@/features/flows/react-flow/blocks/card/schema";
import { ImageBlockViewer } from "@/features/flows/react-flow/blocks/image/viewer";
import type { ImageBlockSchema } from "@/features/flows/react-flow/blocks/image/schema";
import { CardBlockViewer } from "@/features/flows/react-flow/blocks/card/viewer";
import type { VideoBlockSchema } from "@/features/flows/react-flow/blocks/video/schema";
import { VideoBlockViewer } from "@/features/flows/react-flow/blocks/video/viewer";
import type { AudioBlockSchema } from "@/features/flows/react-flow/blocks/audio/schema";
import { AudioBlockViewer } from "@/features/flows/react-flow/blocks/audio/viewer";
import type { CarouselBlockSchema } from "@/features/flows/react-flow/blocks/schema";
import { CarouselBlockViewer } from "@/features/flows/react-flow/blocks/carousel/viewer";

const maps: Record<string, any> = {
  [BlockType.Text]: (data: TextBlockSchema) => (<TextBlockViewer key={data.id} data={data} />),
  [BlockType.Image]: (data: ImageBlockSchema) => (<ImageBlockViewer key={data.id} data={data} />),
  [BlockType.Card]: (data: CardBlockSchema) => (<CardBlockViewer key={data.id} data={data} />),
  [BlockType.Carousel]: (data: CarouselBlockSchema) => (<CarouselBlockViewer key={data.id} data={data} />),
  [BlockType.Video]: (data: VideoBlockSchema) => (<VideoBlockViewer key={data.id} data={data} />),
  [BlockType.FileAudio]: (data: AudioBlockSchema) => (<AudioBlockViewer key={data.id} data={data} />)
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
            data.blocks.map((blockItem) => maps[blockItem?.blockType!](blockItem!))
          }
        </CardContent>
      </Card>
    </>
  )
}
