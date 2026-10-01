import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  errorStateDefaultFn,
  errorStateSchema,
  successStateDefaultFn,
  successStateSchema,
} from "../states"
import { stepTypes } from "./step-action"

/** What the step does to the conversation's routing thread (WhatsApp only today). */
export const threadControlStepActions = z.enum(["release", "pass"])
export type ThreadControlStepAction = z.infer<typeof threadControlStepActions>

export const threadControlStepSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.threadControl),
  action: threadControlStepActions,
  states: z.tuple([successStateSchema, errorStateSchema]),
})

export type ThreadControlStepSchema = z.infer<typeof threadControlStepSchema>

export const threadControlStepDefaultFn = (
  props?: Partial<ThreadControlStepSchema>,
): ThreadControlStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.threadControl,
  action: threadControlStepActions.enum.release,
  states: [successStateDefaultFn(), errorStateDefaultFn()],
  ...props,
})
