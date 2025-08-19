import { z } from "zod"
import { StepType } from "./step-action"

export const AnswerType = {
  Number: "Number",
  SendText: "SendText",
  Email: "Email",
  PhoneNumber: "PhoneNumber",
  Image: "Image",
  File: "File",
  Url: "Url",
  Location: "Location",
  Date: "Date",
  DateTime: "DateTime",
  Others: "Others",
} as const

export const userInputStepSchema = z.object({
  id: z.string().cuid2(),
  stepType: z.literal(StepType.USER_INPUT),
  answerType: z.nativeEnum(AnswerType),
})

export type UserInputStepSchema = z.infer<typeof userInputStepSchema>
