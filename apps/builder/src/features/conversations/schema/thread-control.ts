import {
  THREAD_CONTROL_METADATA_MAX_LENGTH,
  type ThreadControlAction,
  type ThreadControlRole,
  threadControlRoles,
} from "@chatbotx.io/database/partials"
import z from "zod"

/** The public API also offers `sync`, which only reads the owner. */
type ThreadControlRequestAction = ThreadControlAction | "sync"

/**
 * The handover fields a thread-control request may carry. Shared by the inbox
 * action and the public API so both validate the same rules.
 */
export const threadControlHandoverFields = {
  targetRole: threadControlRoles
    .optional()
    .describe(
      "Only with `pass`, WhatsApp only (a Messenger inbox refuses any role but `ai_agent`): the role of the partner to hand the thread to (`control_pass.target_role`). Omit it, or send `escalation`, to hand it to the escalation partner.",
    ),
  metadata: z
    .string()
    .trim()
    .min(1)
    .max(THREAD_CONTROL_METADATA_MAX_LENGTH)
    .optional()
    .describe(
      `Only with \`take\` or \`pass\`: a free-form note (up to ${THREAD_CONTROL_METADATA_MAX_LENGTH} characters) delivered verbatim to the partner that receives the thread.`,
    ),
}

type ThreadControlHandoverRequest = {
  action: ThreadControlRequestAction
  targetRole?: ThreadControlRole
  metadata?: string
}

/** Which actions may carry each handover field (a `release` raises no handover event). */
const ACTIONS_ACCEPTING_TARGET_ROLE: readonly ThreadControlRequestAction[] = [
  "pass",
]
const ACTIONS_ACCEPTING_METADATA: readonly ThreadControlRequestAction[] = [
  "take",
  "pass",
]

export const refineThreadControlHandover = (
  request: ThreadControlHandoverRequest,
  ctx: z.RefinementCtx,
): void => {
  if (
    request.targetRole !== undefined &&
    !ACTIONS_ACCEPTING_TARGET_ROLE.includes(request.action)
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["targetRole"],
      message: "targetRole is only allowed with the `pass` action",
    })
  }
  if (
    request.metadata !== undefined &&
    !ACTIONS_ACCEPTING_METADATA.includes(request.action)
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["metadata"],
      message: "metadata is only allowed with the `take` or `pass` action",
    })
  }
}

/** The note field of the inbox dialogs; empty means "no note" (sent as undefined). */
export const threadControlNoteFormSchema = z.object({
  metadata: z.string().trim().max(THREAD_CONTROL_METADATA_MAX_LENGTH),
})
export type ThreadControlNoteFormValues = z.infer<
  typeof threadControlNoteFormSchema
>

export const threadControlPassFormSchema = threadControlNoteFormSchema.extend({
  targetRole: threadControlRoles,
})
export type ThreadControlPassFormValues = z.infer<
  typeof threadControlPassFormSchema
>
