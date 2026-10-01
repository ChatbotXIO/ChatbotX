import type { ThreadControlStepAction } from "@chatbotx.io/flow-config"

/** Label per step action, shared by the editor radios and the viewer. */
export const THREAD_CONTROL_STEP_ACTION_KEYS = {
  release: "conversationRouting.step.release",
  pass: "conversationRouting.step.pass",
} as const satisfies Record<ThreadControlStepAction, string>
