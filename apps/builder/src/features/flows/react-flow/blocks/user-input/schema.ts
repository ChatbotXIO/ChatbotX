import { z } from "zod"
import { ActionType } from "../../action-type"
import { AnswerType } from "../answer/schema"

export const userInputBlockSchema = z.object({
  id: z.string().cuid2(),
  actionType: z.enum([ActionType.UserInput]),
  answerType: z.nativeEnum(AnswerType),
})

export type UserInputBlockSchema = z.infer<typeof userInputBlockSchema>
