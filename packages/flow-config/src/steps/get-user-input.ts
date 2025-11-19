import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"
import { DelayUnit } from "./wait"

export const ReplyFormat = {
  number: "RF01",
  text: "RF02",
  email: "RF03",
  phone: "RF04",
  image: "RF05",
  file: "RF06",
  link: "RF07",
  location: "RF08",
  date: "RF09",
  datetime: "RF10",
} as const
export type ReplyFormat = (typeof ReplyFormat)[keyof typeof ReplyFormat]

export const getUserInputStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.getUserInput),
  message: z.string().trim().min(1).max(255),
  replyFormat: z.enum(ReplyFormat),
  outputCfId: z.cuid2(),
  retryMessage: z.string().trim().max(255),
  skipButtonLabel: z.string().trim().max(255),
  autoSkip: z.coerce.boolean(),
  autoSkipTimeUnit: z.enum(DelayUnit),
  autoSkipTimeValue: z.coerce.number().int().min(1).max(100),
  autoSkipFailAttempts: z.coerce.number().int().min(1).max(100),
})
export type GetUserInputStepSchema = z.input<typeof getUserInputStepSchema>

export const getUserInputStepDefaultFn = (): GetUserInputStepSchema => ({
  id: createId(),
  stepType: StepType.getUserInput,
  message: "",
  replyFormat: ReplyFormat.text,
  outputCfId: "",
  retryMessage: "",
  skipButtonLabel: "",
  autoSkip: false,
  autoSkipTimeUnit: DelayUnit.minute,
  autoSkipTimeValue: 3,
  autoSkipFailAttempts: 3,
})
