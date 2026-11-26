import {
  type SocialPostFeedRow,
  socialPostFeedRepository,
  socialPostRepository,
  socialPostSnippetRepository,
} from "@chatbotx.io/database/repositories"
import { distributedStore } from "@chatbotx.io/redis"
import { FeedTemplateError } from "@chatbotx.io/utils/feed-template"
import {
  ChatbotXException,
  notFoundException,
  validationException,
} from "../errors"
import { emitSocialPostChanged } from "../social-post/notify"
import { socialPostService } from "../social-post/service"
import { POST_FEED_NO_ITEMS_CODE, POST_FEED_TEST_RATE_CODE } from "./codes"
import { renderFeedTemplate } from "./compose"
import { discardImportedFile, ImageBudget } from "./feed-media"
import { prepareFeedPost } from "./feed-post"
import { chargeFeedFetch, HOUR_SECONDS, readFeed } from "./feed-read"
import { POST_FEED_TEST_PER_HOUR } from "./limits"
import type { ParsedFeedItem } from "./parse"
import type { PostFeedItemDraftContent, PostFeedTestResult } from "./types"

/**
 * "Send test": a DRAFT from the newest item, built exactly as the feed would
 * build it (template or AI, signature, destinations). Never published, never
 * queued, and the item ledger is not touched, so the item still becomes its
 * normal post at the next check. 10 per hour per workspace (AI may be used).
 */
export async function sendTest(input: {
  createdById: string | null
  id: string
  workspaceId: string
}): Promise<PostFeedTestResult> {
  const { id, workspaceId } = input
  const feed = await socialPostFeedRepository.findById({ id, workspaceId })
  if (!feed) {
    throw notFoundException("Feed not found.")
  }
  const used = await distributedStore.incrWithWindow(
    `postfeed:${workspaceId}:test`,
    HOUR_SECONDS,
  )
  if (used > POST_FEED_TEST_PER_HOUR) {
    throw new ChatbotXException(
      "Too many test posts. Try again later.",
      POST_FEED_TEST_RATE_CODE,
      429,
    )
  }
  const context = await draftContext(feed)
  if (context.destinations.length === 0) {
    throw validationException("destinationIds", "The feed has no destination.")
  }
  const [newest] = await readFeed(feed.feedUrl)
  if (!newest) {
    throw new ChatbotXException(
      "The feed has no items yet.",
      POST_FEED_NO_ITEMS_CODE,
      422,
    )
  }
  // The same preparation the worker runs (picture, shape, destinations, text).
  const prepared = await prepareFeedPost({
    budget: new ImageBudget(2, feed.fetchArticleImage ? 1 : 0),
    destinations: context.destinations,
    feed,
    item: newest,
    purpose: "test",
    signature: context.signature,
    timeZone: context.timeZone,
  })
  if (prepared.kind !== "ready") {
    throw validationException(
      "textTemplate",
      `The test post cannot be made (${prepared.kind === "skip" ? prepared.reason : "budget"}).`,
    )
  }
  let post: { id: string }
  try {
    post = await socialPostService.create({
      createdById: input.createdById,
      createdVia: "feed",
      linkUrl: prepared.linkUrl,
      media: prepared.mediaFileId
        ? [
            {
              altText: newest.title,
              mediaLibraryFileId: prepared.mediaFileId,
            },
          ]
        : [],
      targets: prepared.targets.map((target) => ({
        destinationId: target.destinationId,
        ...(target.text === null ? {} : { text: target.text }),
      })),
      text: prepared.text,
      workspaceId,
    })
  } catch (error) {
    if (prepared.importedFileId) {
      await discardImportedFile({
        fileId: prepared.importedFileId,
        workspaceId,
      })
    }
    throw error
  }
  await emitSocialPostChanged({
    socialPostId: post.id,
    status: "draft",
    workspaceId,
  })
  return { note: prepared.reason, socialPostId: post.id }
}

/** The destinations (with their network), signature text and time zone a draft is built with. */
export async function draftContext(feed: SocialPostFeedRow) {
  const links = await socialPostFeedRepository.listDestinations({
    feedIds: [feed.id],
    workspaceId: feed.workspaceId,
  })
  const found = await socialPostRepository.findDestinations({
    ids: links.map((link) => link.destinationId),
    workspaceId: feed.workspaceId,
  })
  const signature = feed.signatureId
    ? await socialPostSnippetRepository.findById({
        id: feed.signatureId,
        workspaceId: feed.workspaceId,
      })
    : null
  return {
    destinations: found.map((destination) => ({
      id: destination.id,
      provider: destination.provider,
    })),
    signature: signature?.kind === "signature" ? signature.content : null,
    timeZone: await socialPostFeedRepository.findWorkspaceTimezone(
      feed.workspaceId,
    ),
  }
}

/**
 * What the composer is prefilled with for one ledger item: the feed's text
 * template applied to it (no AI, nothing is spent), its link and its picture.
 * The item is read again from the feed (the ledger keeps no summary or
 * picture); an item that has left the feed keeps its stored title and link.
 */
export async function itemDraftContent(input: {
  id: string
  itemId: string
  workspaceId: string
}): Promise<PostFeedItemDraftContent> {
  const { id, itemId, workspaceId } = input
  const feed = await socialPostFeedRepository.findById({ id, workspaceId })
  const stored = feed
    ? await socialPostFeedRepository.findItem({
        feedId: id,
        itemId,
        workspaceId,
      })
    : null
  if (!(feed && stored)) {
    throw notFoundException("Feed item not found.")
  }
  let live: ParsedFeedItem | undefined
  try {
    await chargeFeedFetch(workspaceId)
    live = (await readFeed(feed.feedUrl)).find(
      (item) => item.itemKey === stored.itemKey,
    )
  } catch {
    // A feed that is down now (or a workspace over its fetch budget) still lets the stored title and link through.
  }
  const timeZone =
    await socialPostFeedRepository.findWorkspaceTimezone(workspaceId)
  const item = live ?? {
    author: null,
    categories: [],
    content: null,
    feedLink: null,
    feedTitle: null,
    fields: {},
    image: null,
    images: [],
    link: stored.link,
    publishedAt: stored.publishedAt,
    summary: null,
    title: stored.title,
  }
  let text = ""
  try {
    text = renderFeedTemplate({
      item,
      syntax: feed.templateSyntax,
      template: feed.textTemplate,
      timeZone,
    })
  } catch (error) {
    if (!(error instanceof FeedTemplateError)) {
      throw error
    }
  }
  return {
    imageUrl: stored.imageUrl ?? item.image,
    linkUrl: item.link,
    text,
    title: item.title,
  }
}
