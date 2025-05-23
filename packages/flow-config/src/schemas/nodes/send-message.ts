import {
  clearCustomFieldStepSchema,
  markEmailVerifiedStepSchema,
  openAIAnalyzeImageSchema,
  openAIDeleteMessageHistorySchema,
  openAIGenerateImageSchema,
  openAIGenerateTextAdvancedSchema,
  openAIGenerateTextAgentSchema,
  openAIGenerateTextAssistantSchema,
  openAIGenerateTextSchema,
  openAISpeechToTextSchema,
  openAITextToSpeechSchema,
  optInEmailStepSchema,
  optOutEmailStepSchema,
  sendImageStepSchema,
  sendTextStepSchema,
  setCustomFieldStepSchema,
} from "../steps"
import { InboxType, OMNICHANNEL } from "@ahachat.ai/database/types"
import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { baseNodeSchema, NodeType, type NewNodeProps } from "./node-config"

export const actionsStepSchema = [
  // Open AI
  openAIGenerateTextSchema,
  openAIGenerateTextAgentSchema,
  openAIGenerateTextAdvancedSchema,
  openAIGenerateTextAssistantSchema,
  openAIGenerateImageSchema,
  openAIAnalyzeImageSchema,
  openAISpeechToTextSchema,
  openAITextToSpeechSchema,
  openAIDeleteMessageHistorySchema,

  // Email
  markEmailVerifiedStepSchema,
  optInEmailStepSchema,
  optOutEmailStepSchema,
]

export const sendMessageNodeSchema = baseNodeSchema.extend({
  type: z.literal(NodeType.SendMessage),
  data: z.object({
    name: z.string().trim().min(1).max(255),
    isStartNode: z.boolean(),
    inboxType: z.union([z.nativeEnum(InboxType), z.literal(OMNICHANNEL)]),
    steps: z.array(
      z.union([
        sendTextStepSchema,
        sendImageStepSchema,
        setCustomFieldStepSchema,
        clearCustomFieldStepSchema,
        // sendCardStepSchema,
        // sendVideoStepSchema,
        // sendAudioStepSchema,
        // sendCarouselStepSchema,
        // ...actionsStepSchema,
      ]),
    ),
  }),
})
export type SendMessageNodeSchema = z.infer<typeof sendMessageNodeSchema>

export const sendMessageNodeDefaultFn = ({
  labelVersion,
  ...props
}: NewNodeProps): SendMessageNodeSchema => {
  return {
    id: createId(),
    type: NodeType.SendMessage,
    measured: { width: 288, height: 100 },
    ...props,
    data: {
      name: `Send Message #${labelVersion}`,
      inboxType: OMNICHANNEL,
      isStartNode: false,
      steps: [],
    },
  }
}
