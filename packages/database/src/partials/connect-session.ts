import { z } from "zod"

export {
  type ConnectionConfigField,
  type ConnectSessionNextAction,
  connectionConfigFieldSchema,
  connectSessionNextActionSchema,
} from "@chatbotx.io/utils/connection"

/** One selectable target surfaced during `awaiting_selection` — no tokens. */
export const connectSessionTargetSchema = z.object({
  id: z.string(),
  name: z.string(),
  avatarUrl: z.string().optional(),
  selectable: z.boolean(),
  disabledReason: z.string().optional(),
  alreadyConnected: z.enum(["this_workspace", "other_workspace"]).optional(),
})
export type ConnectSessionTarget = z.infer<typeof connectSessionTargetSchema>

/**
 * Per-target result of a `connectTargets` call. Structurally aligned with
 * the `CONNECT_ITEM_STATUSES`/`CONNECT_FAILURE_REASONS` vocabulary in
 * `packages/business/src/inbox/connect-outcome-types.ts` (kept in the
 * database layer as plain strings — that file cannot be imported here,
 * business depends on database, never the reverse).
 */
export const connectSessionOutcomeSchema = z.object({
  targetId: z.string(),
  status: z.enum(["connected", "duplicated", "limitReached", "failed"]),
  connectionId: z.string().optional(),
  reason: z
    .enum([
      "notSelectable",
      "alreadyConnected",
      "channelLimit",
      "workspaceLimit",
      "providerRejected",
      "unknown",
    ])
    .optional(),
  detail: z.string().optional(),
})
export type ConnectSessionOutcome = z.infer<typeof connectSessionOutcomeSchema>
