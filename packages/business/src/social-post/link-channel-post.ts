import {
  channelPostRepository,
  type PublishedChannelPostKnown,
  postTopicRepository,
  publishDestinationStateRepository,
  type SocialDestinationInbox,
  type SocialTargetForPublish,
  socialPostPublishRepository,
  socialPostRepository,
} from "@chatbotx.io/database/repositories"
import { isPostManagementChannel } from "@chatbotx.io/utils/channel"
import type { ChannelPostContentType } from "@chatbotx.io/utils/channel-post"
import { normalisePublishTarget } from "@chatbotx.io/utils/post-publishing"
import type { SocialContentType } from "@chatbotx.io/utils/social-account"
import { LowJobAction, lowQueue } from "@chatbotx.io/worker-config"
import { logger } from "../logger"
import { specsOfRows } from "./media"

type LinkableTarget = Pick<
  SocialTargetForPublish,
  | "contentType"
  | "destinationId"
  | "id"
  | "inboxId"
  | "linkUrl"
  | "options"
  | "overridesMedia"
  | "postText"
  | "provider"
  | "socialPostId"
  | "textOverride"
  | "workspaceId"
>

/** How long the network gets to index a new post before it is re-read. */
export const PUBLISHED_POST_REFRESH_DELAY_MS = 60 * 1000

const CHANNEL_POST_CONTENT_TYPE: Record<
  SocialContentType,
  ChannelPostContentType
> = {
  carousel: "carousel",
  image: "photo",
  link: "link",
  reel: "reel",
  story: "story",
  text: "text",
  video: "video",
}

/** The channel-post vocabulary for a publishing content type. */
export const channelPostContentTypeOf = (
  contentType: SocialContentType,
): ChannelPostContentType => CHANNEL_POST_CONTENT_TYPE[contentType]

/** What the publish already knows about the post, for the `ChannelPost` row. */
const knownAboutPost = async (
  target: LinkableTarget,
  published: { permalink?: string | null; publishedAt?: Date | null },
): Promise<PublishedChannelPostKnown> => {
  const { workspaceId } = target
  const media = target.overridesMedia
    ? await socialPostRepository.listTargetMedia({
        targetIds: [target.id],
        workspaceId,
      })
    : await socialPostRepository.listPostMedia({
        postIds: [target.socialPostId],
        workspaceId,
      })
  const { text } = normalisePublishTarget({
    contentType: target.contentType,
    linkUrl: target.linkUrl,
    media: specsOfRows(media),
    options: target.options,
    provider: target.provider,
    text: target.textOverride ?? target.postText,
  })
  const firstImage = media.find((row) => row.mimeType.startsWith("image/"))
  return {
    caption: text,
    contentType: channelPostContentTypeOf(target.contentType),
    permalink: published.permalink ?? null,
    publishedAt: published.publishedAt ?? null,
    thumbnail: firstImage?.path ?? null,
  }
}

/** Re-reads the post from its channel a little later: fills the counts and any thumbnail the publish could not. */
const scheduleRefresh = async (
  channel: string,
  channelPostId: string,
  workspaceId: string,
  publishedTarget: { socialPostId: string; targetId: string },
): Promise<void> => {
  if (!isPostManagementChannel(channel)) {
    return
  }
  await lowQueue.add(
    LowJobAction.refreshChannelPost,
    {
      type: LowJobAction.refreshChannelPost,
      data: { channelPostId, publishedTarget, workspaceId },
    },
    {
      attempts: 1,
      delay: PUBLISHED_POST_REFRESH_DELAY_MS,
      jobId: `refresh-channel-post-${channelPostId}`,
      removeOnComplete: true,
      removeOnFail: true,
    },
  )
}

/** A Meta target names its inbox; a TikTok target links only when exactly one inbox reads the account. */
const pickInbox = (
  inboxes: readonly SocialDestinationInbox[],
  inboxId: string | null,
): SocialDestinationInbox | undefined => {
  if (inboxId) {
    return inboxes.find((candidate) => candidate.inboxId === inboxId)
  }
  return inboxes.length === 1 ? inboxes[0] : undefined
}

/**
 * Links a published target to the inbox that reads the same account and
 * upserts the `ChannelPost`, copying the topics. A Meta target knows its inbox
 * (`target.inboxId`); a TikTok target links only when exactly one inbox reads
 * the account. Best effort: the post is published whatever happens here.
 */
export const linkPublishedChannelPost = async (
  target: LinkableTarget,
  input: {
    destinationExternalId?: string | null
    externalPostId: string
    permalink?: string | null
    publishedAt?: Date | null
  },
): Promise<void> => {
  const { externalPostId } = input
  try {
    const { workspaceId } = target
    const destinationExternalId =
      input.destinationExternalId ??
      (
        await publishDestinationStateRepository.findById({
          id: target.destinationId,
          workspaceId,
        })
      )?.externalId
    if (!destinationExternalId) {
      return
    }
    const inboxes = await socialPostPublishRepository.findDestinationInboxes({
      externalId: destinationExternalId,
      provider: target.provider,
      workspaceId,
    })
    const inbox = pickInbox(inboxes, target.inboxId)
    if (!inbox || externalPostId === "") {
      return
    }
    const identity = { channel: inbox.channel, externalPostId, workspaceId }
    const channelPostId =
      (await channelPostRepository.upsertPublished({
        ...identity,
        inboxId: inbox.inboxId,
        integrationId: inbox.integrationId,
        known: await knownAboutPost(target, input),
        sourceAccountId: destinationExternalId,
      })) ?? (await channelPostRepository.findByExternalId(identity))?.id
    if (!channelPostId) {
      return
    }
    await socialPostPublishRepository.linkChannelPost({
      channelPostId,
      id: target.id,
      workspaceId,
    })
    const topics = await socialPostRepository.listTopics({
      postIds: [target.socialPostId],
      workspaceId,
    })
    await postTopicRepository.addToPosts({
      channelPostIds: [channelPostId],
      topicIds: topics.map((topic) => topic.id),
    })
    await scheduleRefresh(inbox.channel, channelPostId, workspaceId, {
      socialPostId: target.socialPostId,
      targetId: target.id,
    })
  } catch (err) {
    logger.warn(
      {
        err:
          err instanceof Error ? { message: err.message, name: err.name } : err,
        targetId: target.id,
      },
      "social-post publish: the published post could not be linked to an inbox",
    )
  }
}
