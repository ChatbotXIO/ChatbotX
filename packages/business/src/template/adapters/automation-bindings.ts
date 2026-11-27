import type {
  CommentAutomationType,
  CommentReplyType,
  TemplateCategory,
} from "@chatbotx.io/database/partials"
import { listAutomationAccounts } from "../../comment-automation/account-scope"
import { dependenciesOn, resolveRef } from "./shared"
import type { TemplateHardDependency, TemplateInstallContext } from "./types"

/** What comment and story automations share: a reply that runs a flow or an AI agent, and an account. */
type AutomationReply = { type: CommentReplyType; value: string | null }

/** Reply type -> the category providing what it runs. */
const REPLY_DEPENDENCY_CATEGORY = {
  flow: "flows",
  AIAgent: "aiAgents",
} as const

export const collectReplyDependencies = (
  replies: readonly (AutomationReply | null | undefined)[],
): TemplateHardDependency[] =>
  Object.entries(REPLY_DEPENDENCY_CATEGORY).flatMap(([type, category]) =>
    dependenciesOn(
      category,
      replies.map((reply) => (reply?.type === type ? reply.value : null)),
    ),
  )

/**
 * A reply that runs a flow or an AI agent, pointed at the copy in this
 * workspace (`null` with a warning when it did not come along). `text`/`none`
 * pass through. Explicit rather than the key-name remapper: a bare `value`
 * key is too ambiguous across the sibling reply/keyword shapes to key a
 * reference rule on safely.
 */
export const resolveAutomationReply = <Reply extends AutomationReply>(
  ctx: TemplateInstallContext,
  input: { category: TemplateCategory; path: string; reply: Reply },
): Reply => {
  const { reply } = input
  if (reply.type === "text" || reply.type === "none" || !reply.value) {
    return reply
  }
  return {
    ...reply,
    value: resolveRef(ctx, {
      category: input.category,
      kind: reply.type === "flow" ? "flow" : "aiAgent",
      path: input.path,
      sourceRef: reply.value,
    }),
  }
}

/**
 * The target inbox for an automation scoped to a source inbox, or `null` for
 * "every account of its channel" when it had no scope. An automation that was
 * scoped but whose inbox is not bound (or is not an account of the automation's
 * channel here) cannot be pointed anywhere sensible, so it is reported and the
 * caller installs it inactive instead of silently widening it to every account.
 */
export const resolveAutomationInbox = async (
  ctx: TemplateInstallContext,
  input: {
    category: TemplateCategory
    sourceId: string
    type: CommentAutomationType
    inboxSourceId: string | null
  },
  /** The accounts of each type already read, shared across one insert call. */
  accountsByType: Map<string, Set<string>>,
): Promise<{ inboxId: string | null; resolved: boolean }> => {
  if (!input.inboxSourceId) {
    return { inboxId: null, resolved: true }
  }
  const targetId = ctx.idMaps.inbox?.get(input.inboxSourceId)
  if (targetId) {
    // `Inbox.channel` is `instagram` for both Instagram connections; only the
    // integration tables tell which kind of account this automation can see.
    let accounts = accountsByType.get(input.type)
    if (!accounts) {
      accounts = new Set(
        (
          await listAutomationAccounts({
            workspaceId: ctx.workspaceId,
            type: input.type,
            tx: ctx.tx,
          })
        ).map((account) => account.inboxId),
      )
      accountsByType.set(input.type, accounts)
    }
    if (accounts.has(targetId)) {
      return { inboxId: targetId, resolved: true }
    }
  }
  ctx.warn({
    category: input.category,
    entityKind: "inboxBindingRequired",
    path: `${input.category}.${input.sourceId}.inboxId`,
    value: input.inboxSourceId,
  })
  return { inboxId: null, resolved: false }
}
