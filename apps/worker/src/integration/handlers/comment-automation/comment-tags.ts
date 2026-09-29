import { buildContext, contactInboxService } from "@chatbotx.io/business"
import type { MessengerAuthValue } from "@chatbotx.io/integration-messenger"
import type { AuthValue } from "@chatbotx.io/sdk"
import type { CommentTag } from "@chatbotx.io/worker-config"
import { allIntegrations } from "../../../services/integrations"
import type { CommentAutomationChannelType } from "./channel-type"

export type CommentTagInfo = {
  totalTagged: number
  totalNewTagged: number
}

/**
 * Instagram handles: letters, digits, underscore and dot, at most 30 chars.
 *
 * The leading `(^|[^\w@.])` is what keeps `user@example.com` from reading as a
 * tag of `@example` — a bare `[^\w]` boundary would match the `@` right after
 * `user`. It also blocks `@@handle` and a handle glued to the end of a word.
 * A trailing dot is excluded because Instagram forbids it, so "@user." in
 * "thanks @user." tags `user`, not `user.`.
 */
const INSTAGRAM_MENTION_RE =
  /(?:^|[^\w@.])@([a-z0-9_](?:[a-z0-9_.]{0,28}[a-z0-9_])?)/gi

/**
 * Unique `@handle` mentions in a comment, lowercased.
 *
 * This is a text heuristic and cannot be anything else: Instagram's comment
 * webhook carries no tagged-user list and its Graph API Comment node has no
 * `message_tags` equivalent, so a handle that does not belong to a real
 * account is indistinguishable from one that does.
 */
export function extractInstagramMentions(text: string | undefined): string[] {
  if (!text) {
    return []
  }
  const handles = new Set<string>()
  for (const match of text.matchAll(INSTAGRAM_MENTION_RE)) {
    const handle = match[1]?.toLowerCase()
    if (handle) {
      handles.add(handle)
    }
  }
  return [...handles]
}

/**
 * Facebook resolves tags to real user ids, so dedupe on the id rather than the
 * display name — the same person tagged twice in one comment is one person.
 */
function uniqueTagIds(tags: CommentTag[] | undefined): string[] {
  return [...new Set((tags ?? []).map(({ id }) => id).filter(Boolean))]
}

/**
 * Who a comment tagged, as the two identity kinds the inbox can be matched on:
 * real user ids (Facebook) or lowercased handles parsed from the text (every
 * other channel). Deduped, so `sourceIds.length + sourceUsernames.length` is
 * the number of distinct accounts tagged.
 */
export type CommentMentions = {
  sourceIds: string[]
  sourceUsernames: string[]
}

export function countMentions(mentions: CommentMentions): number {
  return mentions.sourceIds.length + mentions.sourceUsernames.length
}

type CommentTagResolverParams = {
  channelType: CommentAutomationChannelType
  workspaceId: string
  inboxId: string
  commentId: string
  message?: string
  tags?: CommentTag[]
  integrationRow: {
    id: string
    auth: AuthValue
    inboxId: string
    [x: string]: unknown
  }
  auth: MessengerAuthValue
}

/**
 * Returns memoized resolvers for the comment's mentions and the tag counters
 * behind `{{total_tagged}}`/`{{total_new_tagged}}`. Both are fetched at most
 * once per incoming comment no matter how many automations need them — the
 * "enough mentions" filter and tag tracking share the same mention list.
 *
 * Only Facebook is exact: it resolves tags to real user ids. Instagram,
 * Threads and TikTok carry no tagged-user data at all, so their mentions are
 * `@handle`s regexed out of the text — see `extractInstagramMentions`. Both
 * end at the same question: which of these people do we already know in this
 * inbox?
 */
export function createCommentTagResolvers(params: CommentTagResolverParams): {
  resolveMentions: () => Promise<CommentMentions>
  resolveTagInfo: () => Promise<CommentTagInfo>
} {
  const {
    channelType,
    workspaceId,
    inboxId,
    commentId,
    message,
    tags,
    integrationRow,
    auth,
  } = params
  let cachedMentions: CommentMentions | undefined
  let cachedTagInfo: CommentTagInfo | undefined

  const resolveMentions = async (): Promise<CommentMentions> => {
    if (cachedMentions) {
      return cachedMentions
    }

    if (channelType !== "messenger") {
      cachedMentions = {
        sourceIds: [],
        sourceUsernames: extractInstagramMentions(message),
      }
      return cachedMentions
    }

    let sourceIds = uniqueTagIds(tags)
    // The feed webhook omits `message_tags` entirely for an untagged comment,
    // so an empty list is ambiguous and costs one Graph call to disambiguate.
    // Only comments that reach an automation needing mentions get here, so
    // this is not paid on the general comment path.
    if (sourceIds.length === 0) {
      const fetched = await allIntegrations.messenger
        ?.runAction("getCommentMessageTags", {
          ctx: await buildContext({
            workspaceId,
            integrationType: "messenger",
            integration: { ...integrationRow, auth },
          }),
          input: { commentId },
        })
        .catch(() => null)
      sourceIds = uniqueTagIds(fetched ?? undefined)
    }
    cachedMentions = { sourceIds, sourceUsernames: [] }
    return cachedMentions
  }

  const resolveTagInfo = async (): Promise<CommentTagInfo> => {
    if (cachedTagInfo) {
      return cachedTagInfo
    }

    const mentions = await resolveMentions()
    const totalTagged = countMentions(mentions)
    if (totalTagged === 0) {
      cachedTagInfo = { totalTagged: 0, totalNewTagged: 0 }
      return cachedTagInfo
    }

    const known = await contactInboxService.countExistingTaggedIdentities({
      inboxId,
      sourceIds: mentions.sourceIds,
      sourceUsernames: mentions.sourceUsernames,
      // Threads keys its contacts by the lowercased username.
      usernameIsSourceId: channelType === "threads",
    })

    cachedTagInfo = { totalTagged, totalNewTagged: totalTagged - known }
    return cachedTagInfo
  }

  return { resolveMentions, resolveTagInfo }
}
