import { z } from "zod"

/**
 * What the client must do next — mirrors `ConnectNextAction` from
 * `@chatbotx.io/sdk`. Re-declared here (not imported) because
 * `packages/database` cannot depend on `@chatbotx.io/sdk`; the two are kept
 * structurally identical by convention, same as `ConnectionKind` between
 * `@chatbotx.io/sdk` and `@chatbotx.io/utils`.
 */
export const connectSessionNextActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("open_url"), url: z.string() }),
  z.object({ type: z.literal("show_qr"), qr: z.string() }),
  z.object({
    type: z.literal("enter_input"),
    inputFields: z.array(
      z.object({
        name: z.string(),
        type: z.enum(["string", "secret", "number", "boolean", "enum", "url"]),
        required: z.boolean(),
        labelKey: z.string(),
        enumValues: z.array(z.string()).optional(),
        description: z.string().optional(),
      }),
    ),
  }),
  z.object({ type: z.literal("wait") }),
])
export type ConnectSessionNextAction = z.infer<
  typeof connectSessionNextActionSchema
>

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
