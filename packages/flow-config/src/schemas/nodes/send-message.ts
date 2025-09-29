import { InboxType, OMNICHANNEL } from "@aha.chat/database/types"
import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import {
  addContactTagStepSchema,
  addNotesStepSchema,
  archiveConversationStepSchema,
  assignConversationStepSchema,
  autoAssignConversationStepSchema,
  blockContactStepSchema,
  clearCustomFieldStepSchema,
  countCharactersStepSchema,
  deleteContactStepSchema,
  disableBotStepSchema,
  enableBotStepSchema,
  followConversationStepSchema,
  formatDateStepSchema,
  generateCodeStepSchema,
  getDataFromJsonStepSchema,
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
  removeContactTagStepSchema,
  sendAudioStepSchema,
  sendFileStepSchema,
  sendImageStepSchema,
  sendTextStepSchema,
  sendVideoStepSchema,
  setCustomFieldStepSchema,
  unarchiveConversationStepSchema,
  unassignConversationStepSchema,
  unfollowConversationStepSchema,
} from "../steps"
import { baseNodeSchema, type NewNodeProps, NodeType } from "./node-config"

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
        addNotesStepSchema,
        archiveConversationStepSchema,
        assignConversationStepSchema,
        autoAssignConversationStepSchema,
        blockContactStepSchema,
        clearCustomFieldStepSchema,
        countCharactersStepSchema,
        disableBotStepSchema,
        enableBotStepSchema,
        followConversationStepSchema,
        formatDateStepSchema,
        generateCodeStepSchema,
        getDataFromJsonStepSchema,
        markEmailVerifiedStepSchema,
        optInEmailStepSchema,
        optOutEmailStepSchema,
        sendImageStepSchema,
        sendTextStepSchema,
        setCustomFieldStepSchema,
        unarchiveConversationStepSchema,
        unassignConversationStepSchema,
        unfollowConversationStepSchema,
        addContactTagStepSchema,
        removeContactTagStepSchema,
        deleteContactStepSchema,
        // sendCardStepSchema,
        sendVideoStepSchema,
        sendAudioStepSchema,
        sendFileStepSchema,
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
