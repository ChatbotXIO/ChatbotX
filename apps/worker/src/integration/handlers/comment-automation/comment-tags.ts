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
 * Returns a memoized resolver for the tag counters behind `{{total_tagged}}`
 * and `{{total_new_tagged}}`, fetched at most once per incoming comment no
 * matter how many automations have `trackUserTags` on.
 *
 * The two channels resolve through completely different mechanisms and only
 * the Facebook one is exact — see `extractInstagramMentions`. Both end at the
 * same question: which of these people do we already know in this inbox?
 */
export function createTagInfoResolver(params: {
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
}): () => Promise<CommentTagInfo> {
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
  let cached: CommentTagInfo | undefined

  return async () => {
    if (cached) {
      return cached
    }

    let sourceIds: string[] = []
    let sourceUsernames: string[] = []

    if (channelType === "messenger") {
      sourceIds = uniqueTagIds(tags)
      // The feed webhook omits `message_tags` entirely for an untagged
      // comment, so an empty list is ambiguous and costs one Graph call to
      // disambiguate. Only comments that reach an automation with the option
      // on get here, so this is not paid on the general comment path.
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
    } else {
      sourceUsernames = extractInstagramMentions(message)
    }

    const totalTagged = sourceIds.length + sourceUsernames.length
    if (totalTagged === 0) {
      cached = { totalTagged: 0, totalNewTagged: 0 }
      return cached
    }

    const known = await contactInboxService.countExistingTaggedIdentities({
      inboxId,
      sourceIds,
      sourceUsernames,
    })

    cached = { totalTagged, totalNewTagged: totalTagged - known }
    return cached
  }
}
