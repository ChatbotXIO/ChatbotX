import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageCircleMoreIcon } from "lucide-react";
import { FlowFlowNodeToolbar } from "../../toolbars";
import { useState } from "react";
import type { NodeData, NodeBlock } from "@/features/flows/react-flow/blocks/types";
import { SendMessageEditorItem } from "@/features/flows/react-flow/nodes/send-message/menu";
import dynamic from 'next/dynamic'

import NodeLoading from "@/features/flows/react-flow/blocks/loading";

const lazyLoad = (name: string) => dynamic(
  () => import(`@/features/flows/react-flow/blocks/${name}`),
  {
    loading: () => <NodeLoading />
  }
)

const NodeBlockImage = lazyLoad('image')
const NodeBlockCard = lazyLoad('card')

export default function SendMessageNode({ data, id }: { data: NodeData, id: string | number }) {
  const [openToolbar, onOpenToolbar] = useState(false)

  const renderBlockItem = (block: NodeBlock) => {
    if (block.key === SendMessageEditorItem.Image) {
      return block.images && block.images.map((img, idx: number) => <NodeBlockImage key={idx} image={img} />)
    }
    if (block.key === SendMessageEditorItem.Card) {
      return block.cards && block.cards.map((card, idx: number) => <NodeBlockCard key={idx} card={card} />)
    }
  }

  const renderBlocks = () => {
    if (data.blocks && data.blocks.length) {
      return data.blocks.map((block: NodeBlock) => renderBlockItem(block))
    }
    return null
  }

  return (
    <>
      <FlowFlowNodeToolbar visible={openToolbar} />
      <Card className="w-72 hover:border-blue-500" onMouseOver={() => onOpenToolbar(true)} onMouseOut={() => onOpenToolbar(false)}>
        <CardHeader className="p-4">
          <CardTitle className="flex gap-1 items-center">
            <MessageCircleMoreIcon size={20} />
            {data?.label}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          { renderBlocks() }
        </CardContent>
      </Card>
    </>
  )
}
