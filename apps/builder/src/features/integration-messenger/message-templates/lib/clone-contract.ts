/**
 * The contract of the Messenger template clone actions, kept free of server
 * imports so client components (dialog, broadcast clone buttons) can use it.
 */

/** How many pages one clone call may touch: bounds Meta request volume per action. */
export const MAX_CLONE_TARGETS = 25

export type CloneTargetStatus =
  | "approved"
  | "alreadyApproved"
  | "pending"
  | "rejected"
  | "failed"

export type CloneTargetResult = {
  integrationMessengerId: string
  channel: string
  status: CloneTargetStatus
  templateId?: string
  error?: string
}

/**
 * `succeeded` / `failed` keep the shape the clone dialog renders; `pending`
 * is neither (Meta is still reviewing), and `targets` carries every page's
 * outcome for callers that need the stored template id.
 */
export type CloneMessengerTemplateResult = {
  succeeded: { channel: string }[]
  failed: { channel: string; error: string }[]
  pending: { channel: string }[]
  targets: CloneTargetResult[]
}
