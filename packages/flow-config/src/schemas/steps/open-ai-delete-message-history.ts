import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { OpenAIModel } from "./open-ai"
import { StepType } from "./step-action"

export const openAIDeleteMessageHistorySchema = z.object({
  id: z.string().cuid2(),
  stepType: z.literal(StepType.OPENAI_DELETE_MESSAGE_HISTORY),
  model: z.nativeEnum(OpenAIModel),
})

export type OpenAIDeleteMessageHistorySchema = z.infer<
  typeof openAIDeleteMessageHistorySchema
>

export const openAIDeleteMessageHistoryDefaultFn =
  (): OpenAIDeleteMessageHistorySchema => ({
    id: createId(),
    stepType: StepType.OPENAI_DELETE_MESSAGE_HISTORY,
    model: OpenAIModel.GPT4oMini,
  })
