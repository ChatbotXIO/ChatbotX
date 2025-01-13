import { ActionType } from "@/features/flows/react-flow/action-type"
import {
  openAIDefaultValue,
  openAISchema,
} from "@/features/flows/react-flow/blocks/open-ai/schema"
import { z } from "zod"

export const openAIGenerateTextAgentSchema = openAISchema.extend({
  actionType: z.enum([ActionType.OpenAIGenerateTextAgent]),
  agent: z.string(),
})

export type OpenAIGenerateTextAgentSchema = z.infer<
  typeof openAIGenerateTextAgentSchema
>

export const openAIGenerateTextAgentDefaultValue =
  (): OpenAIGenerateTextAgentSchema => ({
    ...openAIDefaultValue(),
    actionType: ActionType.OpenAIGenerateTextAgent,
    agent: "",
    buttons: [],
  })
