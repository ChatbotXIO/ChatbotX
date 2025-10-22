import { z } from "zod"
import { StepType } from "./step-action"

export const AnswerType = {
  number: "number",
  text: "text",
  email: "email",
  phoneNumber: "phoneNumber",
  image: "image",
  file: "file",
  url: "url",
  location: "location",
  date: "date",
  dateTime: "dateTime",
  others: "others",
} as const

export const userInputStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.userInput),
  answerType: z.enum(AnswerType),
})

export type UserInputStepSchema = z.infer<typeof userInputStepSchema>
