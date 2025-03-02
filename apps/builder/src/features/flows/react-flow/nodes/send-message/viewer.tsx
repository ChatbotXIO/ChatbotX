import { BaseHandle } from "@/components/base-handle"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { MarkEmailVerifiedBlockSchema } from "@/features/flows/react-flow/blocks/mark-email-verified/schema"
import { MarkEmailVerifiedBlockViewer } from "@/features/flows/react-flow/blocks/mark-email-verified/viewer"
import type { OpenAIAnalyzeImageSchema } from "@/features/flows/react-flow/blocks/open-ai-analyze-image/schema"
import type { OpenAIDeleteMessageHistorySchema } from "@/features/flows/react-flow/blocks/open-ai-delete-message-history/schema"
import type { OpenAIGenerateImageSchema } from "@/features/flows/react-flow/blocks/open-ai-generate-image/schema"
import type { OpenAIGenerateTextAdvancedSchema } from "@/features/flows/react-flow/blocks/open-ai-generate-text-advanced/schema"
import type { OpenAIGenerateTextAssistantSchema } from "@/features/flows/react-flow/blocks/open-ai-generate-text-assistant/schema"
import type { OpenAIGenerateTextSchema } from "@/features/flows/react-flow/blocks/open-ai-generate-text/schema"
import type { OpenAISpeechToTextSchema } from "@/features/flows/react-flow/blocks/open-ai-speech-to-text/schema"
import type { OpenAITextToSpeechSchema } from "@/features/flows/react-flow/blocks/open-ai-text-to-speech/schema"
import { OpenAIViewer } from "@/features/flows/react-flow/blocks/open-ai/viewer"
import type { OptInEmailBlockSchema } from "@/features/flows/react-flow/blocks/opt-in-email/schema"
import { OptInEmailBlockViewer } from "@/features/flows/react-flow/blocks/opt-in-email/viewer"
import type { OptOutEmailBlockSchema } from "@/features/flows/react-flow/blocks/opt-out-email/schema"
import { OptOutEmailBlockViewer } from "@/features/flows/react-flow/blocks/opt-out-email/viewer"
import type { SendAudioBlockSchema } from "@/features/flows/react-flow/blocks/send-audio/schema"
import { AudioBlockViewer } from "@/features/flows/react-flow/blocks/send-audio/viewer"
import type { SendCardBlockSchema } from "@/features/flows/react-flow/blocks/send-card/schema"
import { SendCardBlockViewer } from "@/features/flows/react-flow/blocks/send-card/viewer"
import type { SendCarouselBlockSchema } from "@/features/flows/react-flow/blocks/send-carousel/schema"
import { SendCarouselBlockViewer } from "@/features/flows/react-flow/blocks/send-carousel/viewer"
import type { SendImageBlockSchema } from "@/features/flows/react-flow/blocks/send-image/schema"
import { SendImageBlockViewer } from "@/features/flows/react-flow/blocks/send-image/viewer"
import type { SendTextBlockSchema } from "@/features/flows/react-flow/blocks/send-text/schema"
import { SendTextBlockViewer } from "@/features/flows/react-flow/blocks/send-text/viewer"
import type { SendVideoBlockSchema } from "@/features/flows/react-flow/blocks/send-video/schema"
import { SendVideoBlockViewer } from "@/features/flows/react-flow/blocks/send-video/viewer"
import { Position } from "@xyflow/react"
import { MessageCircleMoreIcon } from "lucide-react"
import { type ReactNode, useState } from "react"
import { ActionType } from "../../action-type"
import { FlowFlowNodeToolbar } from "../../toolbars"
import type { SendMessageNodeSchema } from "./schema"

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
const maps: Record<ActionType, (data: any) => ReactNode> = {
  [ActionType.SendText]: (data: SendTextBlockSchema) => (
    <SendTextBlockViewer key={data.id} data={data} />
  ),
  [ActionType.SendImage]: (data: SendImageBlockSchema) => (
    <SendImageBlockViewer key={data.id} data={data} />
  ),
  [ActionType.SendCard]: (data: SendCardBlockSchema) => (
    <SendCardBlockViewer key={data.id} data={data} />
  ),
  [ActionType.SendCarousel]: (data: SendCarouselBlockSchema) => (
    <SendCarouselBlockViewer key={data.id} data={data} />
  ),
  [ActionType.SendVideo]: (data: SendVideoBlockSchema) => (
    <SendVideoBlockViewer key={data.id} data={data} />
  ),
  [ActionType.SendAudio]: (data: SendAudioBlockSchema) => (
    <AudioBlockViewer key={data.id} data={data} />
  ),
  [ActionType.OpenAIGenerateText]: (data: OpenAIGenerateTextSchema) => (
    <OpenAIViewer key={data.id} data={data} name="generate text" />
  ),
  [ActionType.OpenAIGenerateTextAgent]: (data: OpenAIGenerateTextSchema) => (
    <OpenAIViewer key={data.id} data={data} name="generate text - agents" />
  ),
  [ActionType.OpenAIGenerateTextAdvanced]: (
    data: OpenAIGenerateTextAdvancedSchema,
  ) => (
    <OpenAIViewer key={data.id} data={data} name="generate text - advanced" />
  ),
  [ActionType.OpenAIGenerateTextAssistant]: (
    data: OpenAIGenerateTextAssistantSchema,
  ) => (
    <OpenAIViewer key={data.id} data={data} name="generate text - assistant" />
  ),
  [ActionType.OpenAIGenerateImage]: (data: OpenAIGenerateImageSchema) => (
    <OpenAIViewer key={data.id} data={data} name="generate image" />
  ),
  [ActionType.OpenAIAnalyzeImage]: (data: OpenAIAnalyzeImageSchema) => (
    <OpenAIViewer key={data.id} data={data} name="analyze image" />
  ),
  [ActionType.OpenAISpeechToText]: (data: OpenAISpeechToTextSchema) => (
    <OpenAIViewer key={data.id} data={data} name="speech to text" />
  ),
  [ActionType.OpenAITextToSpeech]: (data: OpenAITextToSpeechSchema) => (
    <OpenAIViewer key={data.id} data={data} name="text to speech" />
  ),
  [ActionType.OpenAIDeleteMessageHistory]: (
    data: OpenAIDeleteMessageHistorySchema,
  ) => <OpenAIViewer key={data.id} data={data} name="delete message history" />,
  [ActionType.MarkEmailVerified]: (data: MarkEmailVerifiedBlockSchema) => (
    <MarkEmailVerifiedBlockViewer key={data.id} />
  ),
  [ActionType.OptInEmail]: (data: OptInEmailBlockSchema) => (
    <OptInEmailBlockViewer key={data.id} />
  ),
  [ActionType.OptOutEmail]: (data: OptOutEmailBlockSchema) => (
    <OptOutEmailBlockViewer key={data.id} />
  ),
}

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
      <FlowFlowNodeToolbar visible={openToolbar} />
      <Card
        className="w-72 hover:border-blue-500 bg-white/75"
        onMouseOver={() => onOpenToolbar(true)}
        onMouseOut={() => onOpenToolbar(false)}
      >
        <CardHeader className="p-4 relative">
          <BaseHandle id={id} type="target" position={Position.Left} />
          <CardTitle className="flex gap-1 items-center">
            <MessageCircleMoreIcon size={20} />
            {data.name}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {data.blocks.map((blockItem) =>
            blockItem?.actionType
              ? maps[blockItem?.actionType](blockItem)
              : null,
          )}
          <div className="w-full text-right relative">
            <span className="mr-4">Continue</span>
            <BaseHandle id={id} type="source" position={Position.Right} />
          </div>
        </CardContent>
      </Card>
    </>
  )
}
