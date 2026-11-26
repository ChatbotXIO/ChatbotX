import type {
  PostCommenter,
  PublishDestinationStateRow,
} from "@chatbotx.io/database/repositories"
import { getPublicFileUrl } from "@chatbotx.io/utils"
import { resolveContactAvatarUrl } from "../media/resolve-media-url"
import { buildDestinationAvatarUrls } from "../publish-destination/avatar-url"
import { needsAvatarProxy } from "../publish-destination/service"
import { toPublicStorageUrl } from "../utils"

/** A contact inbox of a commenter and the channel it belongs to. */
export type CommenterContactInbox = { channel: string; id: string }

/**
 * The renderable avatar URL of each commenter on one page: a stored key becomes
 * its absolute storage URL, a no-avatar marker the placeholder, and a contact
 * with no picture on a channel that can fetch one a proxy URL. Never the raw
 * storage key, so the browser and the public API need no resolver of their own.
 * Runs over the page's commenters only (at most one page of comments).
 */
export const resolveCommenterAvatars = async (input: {
  commenters: PostCommenter[]
  contactInboxesByContactId: Map<string, CommenterContactInbox[]>
  storageUrl: string
  workspaceId: string
}): Promise<Map<string, string | null>> => {
  const { commenters, contactInboxesByContactId, storageUrl, workspaceId } =
    input
  const finalize = (key: string) => toPublicStorageUrl(key, storageUrl)
  const resolved = await Promise.all(
    commenters.map(
      async (commenter) =>
        [
          commenter.id,
          await resolveContactAvatarUrl(
            {
              contact: { avatar: commenter.avatar },
              contactInboxes: contactInboxesByContactId.get(commenter.id) ?? [],
              workspaceId,
            },
            finalize,
          ),
        ] as const,
    ),
  )
  return new Map(resolved)
}

/**
 * The picture of each page (inbox) from its publish destination: the stored
 * picture as its storage URL; none stored yet, or a stale fetch, as the signed
 * on-view link (the same rule the destination list applies); anything else
 * (no binding, TikTok, a recorded "no picture") is `null`, so the UI shows the
 * channel's brand icon. Keyed by inbox id.
 */
export const resolveInboxAvatars = async (input: {
  destinations: PublishDestinationStateRow[]
  storageUrl: string
  workspaceId: string
}): Promise<Map<string, string | null>> => {
  const { destinations, storageUrl, workspaceId } = input
  const proxyUrls = await buildDestinationAvatarUrls({
    publishDestinationIds: destinations
      .filter(needsAvatarProxy)
      .map((row) => row.id),
    workspaceId,
  })
  const avatars = new Map<string, string | null>()
  for (const row of destinations) {
    if (row.inboxId) {
      avatars.set(
        row.inboxId,
        row.avatar
          ? getPublicFileUrl(row.avatar, storageUrl)
          : (proxyUrls.get(row.id) ?? null),
      )
    }
  }
  return avatars
}
