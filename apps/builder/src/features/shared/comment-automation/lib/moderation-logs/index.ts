import { commentAutomationAnalyticsService } from "@chatbotx.io/analytics"
import {
  commentAutomationService,
  contactInboxService,
} from "@chatbotx.io/business"
import type {
  ChannelType,
  CommentModerationCategory,
  CommentModerationRule,
} from "@chatbotx.io/database/partials"
import type {
  ListModerationLogsPrivateResponse,
  ListModerationLogsRequest,
  ModerationSummaryResponse,
} from "../../schema/moderation-log"

type ModerationLogFilter = Omit<ListModerationLogsRequest, "page" | "perPage">

function toServiceFilter(workspaceId: string, input: ModerationLogFilter) {
  return {
    workspaceId,
    automationId: input.id,
    from: input.from ? new Date(input.from) : undefined,
    to: input.to ? new Date(input.to) : undefined,
    action: input.action,
    source: input.source,
  }
}

/**
 * One page of an automation's moderation log, newest comment first, with the
 * commenter hydrated. Shared by the builder dialog and the public API so both
 * read the same rows; 404s for an automation outside the workspace.
 */
export async function listModerationLogs(
  workspaceId: string,
  input: ListModerationLogsRequest,
): Promise<ListModerationLogsPrivateResponse> {
  await commentAutomationService.findOrFail({ workspaceId, id: input.id })

  const { rows, total } =
    await commentAutomationAnalyticsService.listModerationLogs({
      ...toServiceFilter(workspaceId, input),
      page: input.page,
      perPage: input.perPage,
    })

  const contactInboxIds = [
    ...new Set(
      rows
        .map((row) => row.contactInboxId)
        .filter((id): id is string => id !== null),
    ),
  ]
  // Workspace-scoped, like the stats drill-down: a row whose inbox belongs to
  // another tenant hydrates to nothing.
  const contactInboxes = contactInboxIds.length
    ? await contactInboxService.findManyByIds({
        workspaceId,
        ids: contactInboxIds,
      })
    : []
  const inboxById = new Map(contactInboxes.map((inbox) => [inbox.id, inbox]))

  const data = rows.map((row) => {
    const contactInbox = row.contactInboxId
      ? inboxById.get(row.contactInboxId)
      : undefined
    return {
      id: row.id,
      commentId: row.commentId,
      postId: row.postId,
      commentText: row.commentText,
      source: row.source as "rule" | "ai",
      rule: row.rule as CommentModerationRule | null,
      matchedKeyword: row.matchedKeyword,
      categories: row.categories as CommentModerationCategory[],
      reason: row.reason,
      action: row.action as "hide" | "delete",
      status: row.status as "pending" | "done" | "failed",
      errorDetail: row.errorDetail,
      occurredAt: row.occurredAt.toISOString(),
      contactId: row.contactId,
      contactInboxId: row.contactInboxId,
      conversationId: contactInbox?.conversation?.id ?? null,
      channel: (contactInbox?.channel as ChannelType | undefined) ?? null,
      sourceId: contactInbox?.sourceId ?? null,
      fullName: contactInbox?.contact.fullName ?? null,
      avatar: contactInbox?.contact.avatar ?? null,
    }
  })

  return {
    data,
    total,
    page: input.page,
    pageCount: Math.ceil(total / input.perPage),
  }
}

/** Totals for the same filter as {@link listModerationLogs}. */
export async function getModerationSummary(
  workspaceId: string,
  input: ModerationLogFilter,
): Promise<ModerationSummaryResponse> {
  await commentAutomationService.findOrFail({ workspaceId, id: input.id })

  const rows = await commentAutomationAnalyticsService.getModerationSummary(
    toServiceFilter(workspaceId, input),
  )

  const summary: ModerationSummaryResponse = {
    total: 0,
    hidden: 0,
    deleted: 0,
    byRule: 0,
    byAI: 0,
    failed: 0,
    pending: 0,
  }
  for (const row of rows) {
    summary.total += row.total
    summary[row.action === "delete" ? "deleted" : "hidden"] += row.total
    summary[row.source === "ai" ? "byAI" : "byRule"] += row.total
    if (row.status === "failed") {
      summary.failed += row.total
    } else if (row.status === "pending") {
      summary.pending += row.total
    }
  }
  return summary
}
