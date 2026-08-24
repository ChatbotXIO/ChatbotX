import { fbCommentAutomationModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import type {
  PatchTask,
  ResourceAdapter,
  TemplateInstallContext,
} from "./types"

type TemplateFBCommentPost = {
  type: "published" | "ads" | "reels" | "postIds" | "all"
  // External Facebook post ids — copied verbatim, never remapped. Sibling
  // of `privateReply.value`/`publicReply.value`/`includeKeywords.value`,
  // which is exactly why this adapter resolves the reply fields explicitly
  // rather than through the generic key-name-driven remapper (a bare
  // `value` key is too ambiguous across these sibling shapes to key a
  // reference rule on safely).
  value: string[]
}

type TemplateFBCommentReply = {
  type: "AIAgent" | "text" | "flow" | "none"
  // A `resources.flows`/`aiAgents` sourceId when type is `flow`/`AIAgent`;
  // arbitrary reply text when type is `text`; unused when type is `none`.
  value: string | null
}

type TemplateFBCommentEntry = {
  sourceId: string
  name: string
  type: string
  isActive: boolean
  startTime: string | null
  endTime: string | null
  post: TemplateFBCommentPost
  privateReply: TemplateFBCommentReply
  publicReply: TemplateFBCommentReply
  includeKeywords: unknown
  excludeKeywords: string[]
  options: unknown
  hideComments: unknown
  replyAfter: unknown
  folderId: string | null
}

const resolveReplyValue = (
  ctx: TemplateInstallContext,
  entry: TemplateFBCommentEntry,
  field: "privateReply" | "publicReply",
  reply: TemplateFBCommentReply,
): TemplateFBCommentReply => {
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

const resolveFolderRef = (
  ctx: TemplateInstallContext,
  entry: TemplateFBCommentEntry,
): string | null => {
  if (!entry.folderId) {
    return null
  }
  const targetId = ctx.idMaps.folder?.get(entry.folderId)
  if (!targetId) {
    ctx.warn({
      category: "fbCommentAutomations",
      entityKind: "folder",
      path: `fbCommentAutomations.${entry.sourceId}.folderId`,
      value: entry.folderId,
    })
    return null
  }
  return targetId
}

/**
 * `post.value`/`excludeKeywords` hold external Facebook post ids and plain
 * keyword strings respectively — copied verbatim. `privateReply`/
 * `publicReply` are the two discriminated-union reply configs, each
 * resolved explicitly (`flow` -> `idMaps.flow`, `AIAgent` -> `idMaps.aiAgent`,
 * `text`/`none` passed through) rather than through the generic remapper.
 */
export const fbCommentAutomationsAdapter: ResourceAdapter = {
  category: "fbCommentAutomations",
  providesKinds: [],
  consumesKinds: ["flow", "aiAgent", "folder"],
  deferredKinds: [],

  async insert(
    ctx: TemplateInstallContext,
    entries: readonly (Record<string, unknown> & { sourceId: string })[],
  ): Promise<PatchTask[]> {
    for (const rawEntry of entries) {
      const entry = rawEntry as unknown as TemplateFBCommentEntry
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

      const [created] = await ctx.tx
        .insert(fbCommentAutomationModel)
        .values({
          id: createId(),
          workspaceId: ctx.workspaceId,
          name: entry.name,
          type: entry.type as never,
          isActive: entry.isActive,
          startTime: entry.startTime,
          endTime: entry.endTime,
          folderId,
          post: entry.post,
          privateReply,
          publicReply,
          includeKeywords: entry.includeKeywords as never,
          excludeKeywords: entry.excludeKeywords,
          options: entry.options as never,
          hideComments: entry.hideComments as never,
          replyAfter: entry.replyAfter as never,
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
}
