import type { PostManagementChannel } from "@chatbotx.io/utils/channel"
import { isPostManagementChannel } from "@chatbotx.io/utils/channel"
import { z } from "zod"

/**
 * Who a post is shown as written by. `creator` is an individual the channel
 * reported; `page` and `account` are the owner the post belongs to when no
 * individual is known (a Facebook Page, or an Instagram / Threads / TikTok
 * account).
 */
export const postAuthorKinds = z.enum(["account", "creator", "page"])
export type PostAuthorKind = z.infer<typeof postAuthorKinds>

export type PostAuthor = {
  kind: PostAuthorKind
  name: string
}

const OWNER_KIND_BY_CHANNEL: Record<
  PostManagementChannel,
  Exclude<PostAuthorKind, "creator">
> = {
  instagram: "account",
  messenger: "page",
  threads: "account",
  tiktok: "account",
}

export type PostAuthorSource = {
  authorExternalId?: string | null
  authorName: string | null
  channel: string
  inboxName: string
}

/** The creator when reported, otherwise the page or account that owns the post. */
export const resolvePostAuthor = (post: PostAuthorSource): PostAuthor => {
  const creatorName = post.authorName ?? post.authorExternalId
  if (creatorName) {
    return { kind: "creator", name: creatorName }
  }
  return {
    kind: isPostManagementChannel(post.channel)
      ? OWNER_KIND_BY_CHANNEL[post.channel]
      : "account",
    name: post.inboxName,
  }
}
