import { ActionType } from "@/features/flows/react-flow/action-type"
import {
  openAIDefaultValue,
  openAISchema,
} from "@/features/flows/react-flow/blocks/open-ai/schema"
import { z } from "zod"

export const openAIGenerateTextAdvancedSchema = openAISchema.extend({
  actionType: z.literal(ActionType.OpenAIGenerateTextAdvanced),
  prompt: z.string().optional(),
  userMessage: z.string(),
  resultCustomFieldId: z.string().cuid2(),
  aiTriggerIds: z.array(z.string().cuid2()),
  rememberConversation: z.boolean(),
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().int().min(250).max(4096),
})

export type OpenAIGenerateTextAdvancedSchema = z.infer<
  typeof openAIGenerateTextAdvancedSchema
>

export const openAIGenerateTextAdvancedDefaultValue =
  (): OpenAIGenerateTextAdvancedSchema => ({
    ...openAIDefaultValue(),
    actionType: ActionType.OpenAIGenerateTextAdvanced,
    prompt: "",
    userMessage: "",
    resultCustomFieldId: "",
    aiTriggerIds: [],
    rememberConversation: true,
    temperature: 1.0,
    maxTokens: 250,
  })
