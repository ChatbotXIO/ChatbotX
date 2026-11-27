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

/**
 * Who a `pass` may hand the thread to. Mirrors the roles Meta accepts as a
 * pass target; `flow-config` sits below `database` and `sdk` in the dependency
 * graph, so the list is kept here and pinned by
 * `packages/database/__tests__/thread-control-sdk-parity.test.ts`.
 */
export const threadControlStepTargetRoles = z.enum([
  "ai_agent",
  "ctwa",
  "customer_service",
  "escalation",
  "marketing",
  "utility",
])

/** Meta caps the handover note at 2000 characters (parity-tested too). */
export const THREAD_CONTROL_STEP_METADATA_MAX_LENGTH = 2000

export const threadControlStepSchema = z.object({
  id: zodBigintAsString().describe(
    "Step id (numeric string), unique within the flow.",
  ),
  stepType: z
    .literal(stepTypes.enum.threadControl)
    .describe('Step type discriminator: "threadControl".'),
  action: threadControlStepActions,
  targetRole: threadControlStepTargetRoles
    .optional()
    .describe(
      "Only for `pass`, WhatsApp only (Messenger refuses any role but `ai_agent`): the role to hand the conversation to. Omit it, or use `escalation`, for the escalation partner.",
    ),
  metadata: z
    .string()
    .max(THREAD_CONTROL_STEP_METADATA_MAX_LENGTH)
    .optional()
    .describe(
      "Only for `pass`: a note delivered as-is to the receiving app. Supports variables like {{first_name}}.",
    ),
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
