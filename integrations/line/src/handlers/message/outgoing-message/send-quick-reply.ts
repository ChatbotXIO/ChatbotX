import type { SendQuickReplyStepSchema } from "@chatbotx.io/flow-config"
import { type LineAction, toLineActions } from "./actions"
import type { LineMessage } from "./dispatch"
import { LINE_LIMITS } from "./limits"
import { textMessages } from "./send-text"

/**
 * Quick reply item actions. Same mapping as flex button actions: links and call
 * buttons keep their `uri` action, everything else is a `postback` (never a
 * `message` action), and types LINE cannot render are dropped.
 */
export const toQuickReplyActions = toLineActions

/** Attaches `actions` as quick replies to the last message (max 13 items). */
export function withQuickReplies(
  messages: LineMessage[],
  actions: LineAction[],
): LineMessage[] {
  const last = messages.at(-1)
  if (!last || actions.length === 0) {
    return messages
  }
  const existing =
    (last.quickReply as { items?: unknown[] } | undefined)?.items ?? []
  const items = [
    ...existing,
    ...actions.map((action) => ({ type: "action", action })),
  ].slice(0, LINE_LIMITS.quickReplyItems)
  return [...messages.slice(0, -1), { ...last, quickReply: { items } }]
}

export const convertFlowStepQuickReply = (
  step: Pick<SendQuickReplyStepSchema, "message" | "buttons">,
  flowId: string,
): LineMessage[] =>
  withQuickReplies(
    textMessages(step.message),
    toQuickReplyActions(step.buttons.map((button) => ({ flowId, button }))),
  )
