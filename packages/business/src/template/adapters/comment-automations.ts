import { db } from "@chatbotx.io/database/client"
import type {
  CommentAutomationType,
  CommentPostType,
} from "@chatbotx.io/database/partials"
import { commentAutomationModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import {
  collectReplyDependencies,
  resolveAutomationInbox,
  resolveAutomationReply,
} from "./automation-bindings"
import {
  dependenciesOn,
  makeCollector,
  recordCopy,
  resolveFolderRef,
  resolveRef,
  scopedWhere,
  updateNotSupported,
} from "./shared"
import type {
  PatchTask,
  ResourceAdapter,
  TemplateInstallContext,
} from "./types"

type TemplateCommentPost = {
  type: CommentPostType
  // External Facebook post ids — copied verbatim, never remapped — or, for a
  // `hashtags` target, plain hashtags, which mean the same thing in any
  // workspace and are kept on install (only `postIds` is cleared). Sibling
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

/** The AI agent that moderates comments, when moderation runs on an agent. */
const moderationAgentId = (
  hideComments: TemplateFBCommentEntry["hideComments"],
): string | null =>
  hideComments?.aiModeration && hideComments.aiModeration.engine !== "decision"
    ? (hideComments.aiModeration.aiAgentId ?? null)
    : null

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

/**
 * An AI Router connection holds the source workspace's API key, so it never
 * ships: AI moderation that runs on one is installed switched off with its
 * connection cleared, and the installer is told to pick their own.
 */
const resolveModeration = (
  ctx: TemplateInstallContext,
  entry: TemplateFBCommentEntry,
): TemplateFBCommentEntry["hideComments"] => {
  const { hideComments } = entry
  const aiModeration = hideComments?.aiModeration
  if (!(hideComments && aiModeration)) {
    return hideComments
  }
  const path = `fbCommentAutomations.${entry.sourceId}.hideComments.aiModeration`
  // Inline, not `resolveModerationEngine`: absent `engine` is `aiAgent`.
  if (aiModeration.engine === "decision") {
    if (aiModeration.enabled) {
      ctx.warn({
        category: "fbCommentAutomations",
        entityKind: "credentialRequired",
        path,
        value: aiModeration.decisionModel ?? "",
      })
    }
    return {
      ...hideComments,
      aiModeration: {
        ...aiModeration,
        enabled: false,
        decisionConnectionId: null,
      },
    }
  }
  if (!aiModeration.aiAgentId) {
    return hideComments
  }
  // The agent is a copied resource: point at the copy, or switch moderation
  // off rather than keep the source workspace's agent id.
  const aiAgentId = resolveRef(ctx, {
    category: "fbCommentAutomations",
    kind: "aiAgent",
    path: `${path}.aiAgentId`,
    sourceRef: aiModeration.aiAgentId,
  })
  return {
    ...hideComments,
    aiModeration: {
      ...aiModeration,
      aiAgentId,
      enabled: aiModeration.enabled && aiAgentId !== null,
    },
  }
}

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
    folderTypes: ["fbComment", "igComment"],
    minFormatVersion: 1,
    sync: updateNotSupported("fbCommentAutomations"),

    async insert(
      ctx: TemplateInstallContext,
      entries: readonly TemplateFBCommentEntry[],
    ): Promise<PatchTask[]> {
      const accountsByType = new Map<string, Set<string>>()
      for (const entry of entries) {
        const privateReply = resolveAutomationReply(ctx, {
          category: "fbCommentAutomations",
          path: `fbCommentAutomations.${entry.sourceId}.privateReply.value`,
          reply: entry.privateReply,
        })
        const publicReply = resolveAutomationReply(ctx, {
          category: "fbCommentAutomations",
          path: `fbCommentAutomations.${entry.sourceId}.publicReply.value`,
          reply: entry.publicReply,
        })
        const folderId = resolveFolderRef(ctx, "fbCommentAutomations", entry)
        const { inboxId, resolved: inboxResolved } =
          await resolveAutomationInbox(
            ctx,
            {
              category: "fbCommentAutomations",
              sourceId: entry.sourceId,
              type: entry.type as CommentAutomationType,
              inboxSourceId: entry.inboxSourceId,
            },
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
            hideComments: resolveModeration(ctx, entry),
            replyAfter: entry.replyAfter,
          })
          .returning()

        recordCopy(ctx, {
          category: "fbCommentAutomations",
          resourceKind: "fbCommentAutomation",
          sourceId: entry.sourceId,
          resourceId: created.id,
        })
      }

      return [] satisfies PatchTask[]
    },

    collector: makeCollector({
      findIds: (query) =>
        db.query.commentAutomationModel.findMany({
          where: scopedWhere(query),
          columns: { id: true },
          limit: query.limit,
        }),

      async collectRows(workspaceId, ids) {
        const rows = await db.query.commentAutomationModel.findMany({
          where: scopedWhere({ workspaceId, ids }),
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

        return {
          entries,
          folderIds: rows.flatMap((row) =>
            row.folderId ? [row.folderId] : [],
          ),
          inboxIds: rows.flatMap((row) => (row.inboxId ? [row.inboxId] : [])),
          hardDependencies: [
            ...collectReplyDependencies(
              rows.flatMap((row) => [row.privateReply, row.publicReply]),
            ),
            ...dependenciesOn(
              "aiAgents",
              rows.map((row) => moderationAgentId(row.hideComments)),
            ),
          ],
        }
      },
    }),
  }
