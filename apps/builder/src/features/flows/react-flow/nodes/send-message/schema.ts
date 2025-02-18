import { markEmailVerifiedBlockSchema } from "@/features/flows/react-flow/blocks/mark-email-verified/schema"
import { openAIAnalyzeImageSchema } from "@/features/flows/react-flow/blocks/open-ai-analyze-image/schema"
import { openAIDeleteMessageHistorySchema } from "@/features/flows/react-flow/blocks/open-ai-delete-message-history/schema"
import { openAIGenerateImageSchema } from "@/features/flows/react-flow/blocks/open-ai-generate-image/schema"
import { openAIGenerateTextAdvancedSchema } from "@/features/flows/react-flow/blocks/open-ai-generate-text-advanced/schema"
import { openAIGenerateTextAgentSchema } from "@/features/flows/react-flow/blocks/open-ai-generate-text-agent/schema"
import { openAIGenerateTextAssistantSchema } from "@/features/flows/react-flow/blocks/open-ai-generate-text-assistant/schema"
import { openAIGenerateTextSchema } from "@/features/flows/react-flow/blocks/open-ai-generate-text/schema"
import { openAISpeechToTextSchema } from "@/features/flows/react-flow/blocks/open-ai-speech-to-text/schema"
import { openAITextToSpeechSchema } from "@/features/flows/react-flow/blocks/open-ai-text-to-speech/schema"
import { optInEmailBlockSchema } from "@/features/flows/react-flow/blocks/opt-in-email/schema"
import { optOutEmailBlockSchema } from "@/features/flows/react-flow/blocks/opt-out-email/schema"
import { sendAudioBlockSchema } from "@/features/flows/react-flow/blocks/send-audio/schema"
import { sendCardBlockSchema } from "@/features/flows/react-flow/blocks/send-card/schema"
import { sendCarouselBlockSchema } from "@/features/flows/react-flow/blocks/send-carousel/schema"
import { sendImageBlockSchema } from "@/features/flows/react-flow/blocks/send-image/schema"
import { sendTextBlockSchema } from "@/features/flows/react-flow/blocks/send-text/schema"
import { sendVideoBlockSchema } from "@/features/flows/react-flow/blocks/send-video/schema"
import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { MessageType, NodeType, baseNodeSchema } from "../../types"

export const sendMessageNodeDataSchema = z.object({
  name: z.string().min(1).max(255).trim(),
  messageType: z.nativeEnum(MessageType),
  blocks: z.array(
    z.union([
      sendTextBlockSchema,
      sendImageBlockSchema,
      sendCardBlockSchema,
      sendVideoBlockSchema,
      sendAudioBlockSchema,
      sendCarouselBlockSchema,
      openAIGenerateTextSchema,
      openAIGenerateTextAgentSchema,
      openAIGenerateTextAdvancedSchema,
      openAIGenerateTextAssistantSchema,
      openAIGenerateImageSchema,
      openAIAnalyzeImageSchema,
      openAISpeechToTextSchema,
      openAITextToSpeechSchema,
      openAIDeleteMessageHistorySchema,
      markEmailVerifiedBlockSchema,
      optInEmailBlockSchema,
      optOutEmailBlockSchema,
    ]),
  ),
})

export const sendMessageNodeSchema = baseNodeSchema.extend({
  type: z.literal(NodeType.SendMessage),
  data: sendMessageNodeDataSchema,
})

export type SendMessageNodeSchema = z.infer<typeof sendMessageNodeSchema>

export const defaultSendMessageNode = (
  labelVersion: number,
): SendMessageNodeSchema => {
  return {
    id: createId(),
    type: NodeType.SendMessage,
    position: {
      x: 100,
      y: 100,
    },
    data: {
      name: `Send Message #${labelVersion}`,
      messageType: MessageType.Omnichannel,
      blocks: [],
    },
  }
}
