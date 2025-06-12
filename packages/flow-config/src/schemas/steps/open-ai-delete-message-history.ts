import { StepType } from "./step-action"
import { OpenAIModel } from "./open-ai"
import { z } from "zod"
import { createId } from "@paralleldrive/cuid2"

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
