import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import {
  skipStateDefaultFn,
  skipStateSchema,
  successStateDefaultFn,
  successStateSchema,
} from "../states"
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

export const getUserDataStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.getUserData),
  message: z.string().trim().min(1).max(255),
  replyFormat: z.string().pipe(z.enum(ReplyFormat)),
  outputCfId: z.string().trim(),
  retryMessage: z.string().trim().max(255),
  skipButtonLabel: z.string().trim().max(255),
  autoSkip: z.boolean(),
  autoSkipTimeUnit: z.string().pipe(z.enum(DelayUnit)),
  autoSkipTimeValue: z.coerce.number().int().min(1).max(100),
  autoSkipFailAttempts: z.coerce.number().int().min(1).max(100),
  states: z.tuple([successStateSchema, skipStateSchema]),
})
export type GetUserDataStepSchema = z.infer<typeof getUserDataStepSchema>

export const getUserDataStepDefaultFn = (): GetUserDataStepSchema => ({
  id: createId(),
  stepType: StepType.getUserData,
  message: "",
  replyFormat: ReplyFormat.text,
  outputCfId: "",
  retryMessage: "",
  skipButtonLabel: "",
  autoSkip: false,
  autoSkipTimeUnit: DelayUnit.minutes,
  autoSkipTimeValue: 3,
  autoSkipFailAttempts: 3,
  states: [successStateDefaultFn(), skipStateDefaultFn()],
})
