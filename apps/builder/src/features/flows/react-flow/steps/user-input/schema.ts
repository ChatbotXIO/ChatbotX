import { z } from "zod"
import { StepType } from "../step-action"
import { AnswerType } from "../answer/schema"

export const userInputStepSchema = z.object({
  id: z.string().cuid2(),
  stepType: z.literal(StepType.UserInput),
  answerType: z.nativeEnum(AnswerType),
})

export type UserInputStepSchema = z.infer<typeof userInputStepSchema>
