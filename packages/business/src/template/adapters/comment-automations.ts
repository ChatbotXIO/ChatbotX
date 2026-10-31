import { db } from "@chatbotx.io/database/client"
import type { CommentAutomationType } from "@chatbotx.io/database/partials"
import { commentAutomationModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { listAutomationAccounts } from "../../comment-automation/account-scope"
import {
  EMPTY_COLLECT_RESULT,
  resolveRef,
  updateNotSupported,
  verifyOwnedIds,
} from "./shared"
import type {
  PatchTask,
  ResourceAdapter,
  ResourceCollector,
  TemplateHardDependency,
  TemplateInstallContext,
} from "./types"

type TemplateCommentPost = {
  type: "published" | "ads" | "reels" | "postIds" | "all" | "live"
  // External Facebook post ids — copied verbatim, never remapped. Sibling
  // of `privateReply.value`/`publicReply.value`/`includeKeywords.value`,
  // which is exactly why this adapter resolves the reply fields explicitly
  // rather than through the generic key-name-driven remapper (a bare
  // `value` key is too ambiguous across these sibling shapes to key a
  // reference rule on safely).
  value: string[]
}

type TemplateCommentReply = {
  type: "AIAgent" | "text" | "flow" | "none"
  // A `resources.flows`/`aiAgents` sourceId when type is `flow`/`AIAgent`;
  // arbitrary reply text when type is `text`; unused when type is `none`.
  value: string | null
}

type CommentAutomationInsert = typeof commentAutomationModel.$inferInsert

type TemplateFBCommentEntry = {
  sourceId: string
  name: string
  type: CommentAutomationInsert["type"] & string
  isActive: boolean
  startTime: string | null
  endTime: string | null
  post: TemplateCommentPost
  privateReply: TemplateCommentReply
  publicReply: TemplateCommentReply
  /** The source inbox the automation was scoped to; null = every account of its channel. */
  inboxSourceId: string | null
  includeKeywords: CommentAutomationInsert["includeKeywords"]
  excludeKeywords: string[]
  options: CommentAutomationInsert["options"]
  hideComments: CommentAutomationInsert["hideComments"]
  replyAfter: CommentAutomationInsert["replyAfter"]
  folderId: string | null
}

/** Reply type -> the category providing what it runs. */
const REPLY_DEPENDENCY_CATEGORY: Readonly<
  Record<string, TemplateHardDependency["category"] | undefined>
> = { flow: "flows", AIAgent: "aiAgents" }

const collectReplyDependencies = (
  replies: readonly (TemplateCommentReply | null | undefined)[],
): TemplateHardDependency[] => {
  const seen = new Map<string, TemplateHardDependency>()
  for (const reply of replies) {
    const category = reply ? REPLY_DEPENDENCY_CATEGORY[reply.type] : undefined
    if (category && reply?.value) {
      seen.set(`${category}:${reply.value}`, {
        category,
        sourceId: reply.value,
      })
    }
  }
  return [...seen.values()]
}

const resolveReplyValue = (
  ctx: TemplateInstallContext,
  entry: TemplateFBCommentEntry,
  field: "privateReply" | "publicReply",
  reply: TemplateCommentReply,
): TemplateCommentReply => {
  if (reply.type === "text" || reply.type === "none" || !reply.value) {
    return reply
  }

  const entityKind = reply.type === "flow" ? "flow" : "aiAgent"
  const targetId = ctx.idMaps[entityKind]?.get(reply.value)
  if (!targetId) {
    ctx.warn({
      category: "fbCommentAutomations",
      entityKind,
      path: `fbCommentAutomations.${entry.sourceId}.${field}.value`,
      value: reply.value,
    })
    return { ...reply, value: null }
  }
  return { ...reply, value: targetId }
}

/**
 * The target inbox for an automation scoped to a source inbox, or `null` for
 * "every account of its channel" when it had no scope. An automation that was
 * scoped but whose inbox is not bound (or is not an account of the automation's
 * channel here) cannot be pointed anywhere sensible, so it is reported and the
 * caller installs it inactive instead of silently widening it to every account.
 */
const resolveInboxRef = async (
  ctx: TemplateInstallContext,
  entry: TemplateFBCommentEntry,
  accountsByType: Map<string, Set<string>>,
): Promise<{ inboxId: string | null; resolved: boolean }> => {
  if (!entry.inboxSourceId) {
    return { inboxId: null, resolved: true }
  }
  const targetId = ctx.idMaps.inbox?.get(entry.inboxSourceId)
  if (targetId) {
    // `Inbox.channel` is `instagram` for both Instagram connections; only the
    // integration tables tell which kind of account this automation can see.
    let accounts = accountsByType.get(entry.type)
    if (!accounts) {
      accounts = new Set(
        (
          await listAutomationAccounts({
            workspaceId: ctx.workspaceId,
            type: entry.type as CommentAutomationType,
            tx: ctx.tx,
          })
        ).map((account) => account.inboxId),
      )
      accountsByType.set(entry.type, accounts)
    }
    if (accounts.has(targetId)) {
      return { inboxId: targetId, resolved: true }
    }
  }
  ctx.warn({
    category: "fbCommentAutomations",
    entityKind: "inboxBindingRequired",
    path: `fbCommentAutomations.${entry.sourceId}.inboxId`,
    value: entry.inboxSourceId,
  })
  return { inboxId: null, resolved: false }
}

/**
 * A "choose posts" automation names Facebook/Instagram post ids of the source
 * account, which mean nothing in the installer's: the selection is cleared and
 * the installer picks their own posts before turning it on.
 */
const clearPostSelection = (
  ctx: TemplateInstallContext,
  entry: TemplateFBCommentEntry,
): { post: TemplateCommentPost; cleared: boolean } => {
  if (entry.post.type !== "postIds") {
    return { post: entry.post, cleared: false }
  }
  ctx.warn({
    category: "fbCommentAutomations",
    entityKind: "postSelectionRequired",
    path: `fbCommentAutomations.${entry.sourceId}.post`,
    value: entry.post.value.join(","),
  })
  return { post: { ...entry.post, value: [] }, cleared: true }
}

const resolveFolderRef = (
  ctx: TemplateInstallContext,
  entry: TemplateFBCommentEntry,
): string | null =>
  resolveRef(ctx, {
    category: "fbCommentAutomations",
    kind: "folder",
    path: `fbCommentAutomations.${entry.sourceId}.folderId`,
    sourceRef: entry.folderId,
  })

/**
 * `post.value`/`excludeKeywords` hold external Facebook post ids and plain
 * keyword strings respectively — copied verbatim. `privateReply`/
 * `publicReply` are the two discriminated-union reply configs, each
 * resolved explicitly (`flow` -> `idMaps.flow`, `AIAgent` -> `idMaps.aiAgent`,
 * `text`/`none` passed through) rather than through the generic remapper.
 */
export const commentAutomationsAdapter: ResourceAdapter<TemplateFBCommentEntry> =
  {
    category: "fbCommentAutomations",
    providesKinds: [],
    consumesKinds: ["flow", "aiAgent", "folder", "inbox"],
    deferredKinds: [],
    trackedKind: "fbCommentAutomation",
    folderTypes: ["fbComment", "igComment", "igStory"],
    minFormatVersion: 1,
    sync: updateNotSupported("fbCommentAutomations"),

    async insert(
      ctx: TemplateInstallContext,
      entries: readonly TemplateFBCommentEntry[],
    ): Promise<PatchTask[]> {
      const accountsByType = new Map<string, Set<string>>()
      for (const entry of entries) {
        const privateReply = resolveReplyValue(
          ctx,
          entry,
          "privateReply",
          entry.privateReply,
        )
        const publicReply = resolveReplyValue(
          ctx,
          entry,
          "publicReply",
          entry.publicReply,
        )
        const folderId = resolveFolderRef(ctx, entry)
        const { inboxId, resolved: inboxResolved } = await resolveInboxRef(
          ctx,
          entry,
          accountsByType,
        )
        const { post, cleared: postCleared } = clearPostSelection(ctx, entry)

        const [created] = await ctx.tx
          .insert(commentAutomationModel)
          .values({
            id: createId(),
            workspaceId: ctx.workspaceId,
            name: entry.name,
            type: entry.type,
            // Never live without its account and posts: it would match nothing
            // (or, unscoped, everything) until the installer completes it.
            isActive: entry.isActive && inboxResolved && !postCleared,
            startTime: entry.startTime,
            endTime: entry.endTime,
            folderId,
            inboxId,
            post,
            privateReply,
            publicReply,
            includeKeywords: entry.includeKeywords,
            excludeKeywords: entry.excludeKeywords,
            options: entry.options,
            hideComments: entry.hideComments,
            replyAfter: entry.replyAfter,
          })
          .returning()

        ctx.track({
          category: "fbCommentAutomations",
          resourceKind: "fbCommentAutomation",
          resourceId: created.id,
          sourceResourceId: entry.sourceId,
          wasExisting: false,
        })
      }

      return [] satisfies PatchTask[]
    },

    collector: {
      async resolveIds(workspaceId, limit) {
        const rows = await db.query.commentAutomationModel.findMany({
          where: { workspaceId },
          columns: { id: true },
          limit,
        })
        return rows.map((row) => row.id)
      },

      async verifyOwnership(workspaceId, ids) {
        return await verifyOwnedIds(ids, (uniqueIds) =>
          db.query.commentAutomationModel.findMany({
            where: { workspaceId, id: { in: uniqueIds } },
            columns: { id: true },
          }),
        )
      },

      async collect(workspaceId, ids) {
        if (ids.length === 0) {
          return EMPTY_COLLECT_RESULT
        }
        const rows = await db.query.commentAutomationModel.findMany({
          where: { workspaceId, id: { in: [...ids] } },
        })
        // `inboxSourceId` is the source workspace's inbox; the install binds it
        // to one of the installer's own inboxes (the `inboxes` manifest names
        // it) and leaves the automation inactive when no inbox stands in.
        const entries = rows.map((row) => ({
          sourceId: row.id,
          name: row.name,
          type: row.type,
          isActive: row.isActive,
          startTime: row.startTime,
          endTime: row.endTime,
          post: row.post,
          // `privateReply.value`/`publicReply.value` are still the real
          // source-workspace flow/aiAgent ids at collect time — resolved only
          // at install time (`resolveReplyValue`). They degrade to warn+skip
          // there, but the flow/agent a reply runs is reported below so it ships
          // with the automation.
          privateReply: row.privateReply,
          publicReply: row.publicReply,
          includeKeywords: row.includeKeywords,
          excludeKeywords: row.excludeKeywords,
          options: row.options,
          hideComments: row.hideComments,
          replyAfter: row.replyAfter,
          folderId: row.folderId,
          inboxSourceId: row.inboxId,
        }))
        const folderIds = rows.flatMap((row) =>
          row.folderId ? [row.folderId] : [],
        )

        return {
          entries,
          folderIds,
          productCategoryIds: [],
          inboxIds: rows.flatMap((row) => (row.inboxId ? [row.inboxId] : [])),
          hardDependencies: collectReplyDependencies(
            rows.flatMap((row) => [row.privateReply, row.publicReply]),
          ),
        }
      },
    } satisfies ResourceCollector,
  }
