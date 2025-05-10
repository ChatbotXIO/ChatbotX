import { markEmailVerifiedStepSchema } from "@/features/flows/react-flow/steps/mark-email-verified/schema"
import { openAIAnalyzeImageSchema } from "@/features/flows/react-flow/steps/open-ai-analyze-image/schema"
import { openAIDeleteMessageHistorySchema } from "@/features/flows/react-flow/steps/open-ai-delete-message-history/schema"
import { openAIGenerateImageSchema } from "@/features/flows/react-flow/steps/open-ai-generate-image/schema"
import { openAIGenerateTextAdvancedSchema } from "@/features/flows/react-flow/steps/open-ai-generate-text-advanced/schema"
import { openAIGenerateTextAgentSchema } from "@/features/flows/react-flow/steps/open-ai-generate-text-agent/schema"
import { openAIGenerateTextAssistantSchema } from "@/features/flows/react-flow/steps/open-ai-generate-text-assistant/schema"
import { openAIGenerateTextSchema } from "@/features/flows/react-flow/steps/open-ai-generate-text/schema"
import { openAISpeechToTextSchema } from "@/features/flows/react-flow/steps/open-ai-speech-to-text/schema"
import { openAITextToSpeechSchema } from "@/features/flows/react-flow/steps/open-ai-text-to-speech/schema"
import { optInEmailStepSchema } from "@/features/flows/react-flow/steps/opt-in-email/schema"
import { optOutEmailStepSchema } from "@/features/flows/react-flow/steps/opt-out-email/schema"
import { sendImageStepSchema } from "@/features/flows/react-flow/steps/send-image/schema"
import { sendTextStepSchema } from "@/features/flows/react-flow/steps/send-text/schema"
import { InboxType } from "@ahachat.ai/database/types"
import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { NodeType, baseNodeSchema } from "../../types"
import type { NewNodeProps } from "../types"

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
    inboxType: z.union([z.nativeEnum(InboxType), z.literal("OMNICHANNEL")]),
    steps: z.array(
      z.union([
        sendTextStepSchema,
        sendImageStepSchema,
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
      inboxType: "OMNICHANNEL",
      isStartNode: false,
      steps: [],
    },
  }
}
