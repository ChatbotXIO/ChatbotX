import type { SocialPostFeedRow } from "@chatbotx.io/database/repositories"
import { FeedTemplateError } from "@chatbotx.io/utils/feed-template"
import { composeFeedText, FEED_TEMPLATE_FAILED_CODE } from "./compose"
import {
  acquireFeedMedia,
  discardImportedFile,
  type ImageBudget,
  pictureCandidates,
} from "./feed-media"
import {
  type FeedDestination,
  type FeedPostShape,
  partitionDestinations,
  resolveFeedShape,
} from "./feed-shape"
import { POST_FEED_POST_TEXT_MAX } from "./limits"
import type { ParsedFeedItem } from "./parse"
import { safeLink } from "./text"

/** The picture columns every ledger row of an item carries. */
export type FeedImageColumns = {
  imageError: string | null
  imageSource: string | null
  imageUrl: string | null
}

export type FeedPostTarget = { destinationId: string; text: string | null }

export type PreparedFeedPost =
  | {
      /** The picture budget of this check is spent: nothing is recorded, the item is tried again next check. */
      kind: "defer"
    }
  | {
      columns: FeedImageColumns
      droppedDestinationIds: string[]
      kind: "skip"
      /** The file this call imported and nobody uses (already removed). */
      outcome: "skippedInvalid" | "skippedNoImage"
      reason: string
    }
  | {
      columns: FeedImageColumns
      droppedDestinationIds: string[]
      /** Set when this call imported the file (remove it when the post is not stored). */
      importedFileId: string | null
      keptIds: string[]
      kind: "ready"
      linkUrl: string | null
      mediaFileId: string | null
      /** Comma-separated notes for the ledger `reason`, or null. */
      reason: string | null
      shape: Exclude<FeedPostShape, "skip">
      /**
       * The destinations the post goes to, in order. `text` is set only when the
       * network's own template differs from the shared `text`.
       */
      targets: FeedPostTarget[]
      text: string
    }

/** The text without the item's link when the post carries the link as a preview. */
const withoutLink = (text: string, linkUrl: string | null): string =>
  linkUrl && text.includes(linkUrl)
    ? text
        .split(linkUrl)
        .join("")
        .replace(/\n{3,}/g, "\n\n")
        .trim() || text
    : text

const joinReasons = (
  notes: readonly (string | null | false | undefined)[],
): string | null => {
  const kept = notes.filter((note): note is string => Boolean(note))
  return kept.length > 0 ? kept.join(",") : null
}

/**
 * Everything that decides what an item's post is, shared by the worker's check
 * and "Send test" so they cannot disagree: the picture (imported first, outside
 * any transaction), the post's shape, which destinations can carry it, and the
 * text. A destination that cannot carry the shape is left out of THIS item's
 * post and listed; when none is left, or the item must be skipped, the result
 * says why and any file this call imported has been removed again.
 */
export const prepareFeedPost = async (input: {
  budget: ImageBudget
  destinations: readonly FeedDestination[]
  feed: SocialPostFeedRow
  item: ParsedFeedItem
  purpose: "post" | "test"
  signature: string | null
  timeZone: string
}): Promise<PreparedFeedPost> => {
  const { feed, item } = input
  const none = { imageError: null, imageSource: null, imageUrl: null }
  const skipped = (
    reason: string,
    columns: FeedImageColumns = none,
    extra: {
      dropped?: string[]
      outcome?: "skippedInvalid" | "skippedNoImage"
    } = {},
  ): PreparedFeedPost => ({
    columns,
    droppedDestinationIds: extra.dropped ?? [],
    kind: "skip",
    outcome: extra.outcome ?? "skippedInvalid",
    reason,
  })
  if (input.destinations.length === 0) {
    return skipped("noDestination")
  }
  const wantsPicture = feed.postAs === "photo"
  const media = wantsPicture
    ? await acquireFeedMedia({
        articleUrl: safeLink(item.link),
        budget: input.budget,
        candidates: pictureCandidates(feed, item, input.timeZone),
        feed,
        itemKey: item.itemKey,
        purpose: input.purpose,
      })
    : null
  if (
    input.purpose === "post" &&
    media &&
    !media.fileId &&
    media.imageError === "budget"
  ) {
    return { kind: "defer" }
  }
  const importedFileId = media?.created ? media.fileId : null
  const columns: FeedImageColumns = {
    imageError: media?.imageError ?? null,
    imageSource: media?.imageSource ?? null,
    imageUrl: media?.imageUrl ?? null,
  }
  const release = async (
    result: PreparedFeedPost,
  ): Promise<PreparedFeedPost> => {
    if (importedFileId) {
      await discardImportedFile({
        fileId: importedFileId,
        workspaceId: feed.workspaceId,
      })
    }
    return result
  }
  const shape = resolveFeedShape({
    hasImage: Boolean(media?.fileId),
    noImageFallback: feed.noImageFallback,
    postAs: feed.postAs,
  })
  const missingPicture = wantsPicture && !media?.fileId
  if (shape === "skip") {
    return await release(
      skipped("noImage", columns, { outcome: "skippedNoImage" }),
    )
  }
  const { dropped, kept } = partitionDestinations(input.destinations, shape)
  const droppedIds = dropped.map((destination) => destination.id)
  if (kept.length === 0) {
    return await release(
      skipped("noDestinationAccepts", columns, {
        dropped: droppedIds,
        outcome: missingPicture ? "skippedNoImage" : "skippedInvalid",
      }),
    )
  }
  const providers = [
    ...new Set(kept.map((destination) => destination.provider)),
  ]
  let composed: Awaited<ReturnType<typeof composeFeedText>>
  try {
    composed = await composeFeedText({
      destinationIds: kept.map((destination) => destination.id),
      feed,
      image: media?.imageUrl ?? item.image,
      item,
      providers,
      purpose: input.purpose,
      signature: input.signature,
      timeZone: input.timeZone,
    })
  } catch (err) {
    if (err instanceof FeedTemplateError) {
      return await release(skipped(FEED_TEMPLATE_FAILED_CODE, columns))
    }
    throw err
  }
  const linkUrl = shape === "link" ? item.link : null
  const sharedText = withoutLink(composed.text, linkUrl)
  const sharedFits =
    sharedText.length > 0 && sharedText.length <= POST_FEED_POST_TEXT_MAX
  // A destination with its own text does not need the shared one; one that relies on it
  // needs it to be usable. A network whose text renders nothing is left out of THIS
  // item's post (listed, like any destination that cannot carry it); the final authority
  // on length and rules stays the publishing normaliser when the post is created.
  const targets: FeedPostTarget[] = []
  const emptied: string[] = []
  for (const destination of kept) {
    const own = composed.providerTexts[destination.provider]
    const ownText = own === undefined ? null : withoutLink(own, linkUrl)
    if (ownText === null) {
      if (sharedText.length > POST_FEED_POST_TEXT_MAX) {
        return await release(skipped("textTooLong", columns))
      }
      if (sharedText.length === 0) {
        emptied.push(destination.id)
      } else {
        targets.push({ destinationId: destination.id, text: null })
      }
    } else if (!ownText) {
      emptied.push(destination.id)
    } else if (ownText.length > POST_FEED_POST_TEXT_MAX) {
      return await release(skipped("textTooLong", columns))
    } else {
      targets.push({
        destinationId: destination.id,
        text: sharedFits && ownText === sharedText ? null : ownText,
      })
    }
  }
  if (targets.length === 0) {
    return await release(
      skipped("emptyText", columns, { dropped: [...droppedIds, ...emptied] }),
    )
  }
  // With no usable shared text the post's own text is the first target's, and that target has no override.
  let text = sharedText
  if (!sharedFits) {
    const [first] = targets
    text = first?.text ?? ""
    if (first) {
      targets[0] = { destinationId: first.destinationId, text: null }
    }
  }
  const keptIds = targets.map((target) => target.destinationId)
  const allDroppedIds = [...droppedIds, ...emptied]
  return {
    columns,
    droppedDestinationIds: allDroppedIds,
    importedFileId,
    keptIds,
    kind: "ready",
    linkUrl,
    mediaFileId: shape === "photo" ? (media?.fileId ?? null) : null,
    reason: joinReasons([
      composed.note,
      columns.imageError && !media?.fileId && "imageFailed",
      missingPicture && shape !== "photo" && "noImageFallback",
      allDroppedIds.length > 0 && "droppedTargets",
    ]),
    shape,
    targets,
    text,
  }
}
