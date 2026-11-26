import type {
  SocialPostFeedNoImageFallback,
  SocialPostFeedPostAs,
  SocialProvider,
} from "@chatbotx.io/database/partials"
import { enabledContentTypes } from "@chatbotx.io/utils/post-publishing"

/** What one post made from a feed item is: with its picture, with a link, text only, or not made at all. */
export type FeedPostShape = "photo" | "link" | "text" | "skip"

/**
 * The shape of an item's post. With `postAs` `photo` an item that has no usable
 * picture follows the feed's fallback; `link` and `text` never carry a file.
 */
export const resolveFeedShape = (input: {
  hasImage: boolean
  noImageFallback: SocialPostFeedNoImageFallback
  postAs: SocialPostFeedPostAs
}): FeedPostShape => {
  if (input.postAs !== "photo") {
    return input.postAs
  }
  if (input.hasImage) {
    return "photo"
  }
  return input.noImageFallback === "skip" ? "skip" : input.noImageFallback
}

/**
 * Whether a network can carry a post of this shape, read from the publishing
 * rules registry (the same source the composer and the publisher use). A post
 * shares its files across destinations, so a destination that cannot carry the
 * shape (Instagram needs a picture; TikTok takes video only) is left out of
 * the item's post rather than failing it for everyone.
 */
export const providerCarries = (
  provider: SocialProvider,
  shape: Exclude<FeedPostShape, "skip">,
): boolean => {
  const types = enabledContentTypes(provider)
  if (shape === "photo") {
    return types.includes("image")
  }
  return types.includes("text") || types.includes("link")
}

export type FeedDestination = { id: string; provider: SocialProvider }

export const partitionDestinations = <Destination extends FeedDestination>(
  destinations: readonly Destination[],
  shape: Exclude<FeedPostShape, "skip">,
): { dropped: Destination[]; kept: Destination[] } => {
  const kept: Destination[] = []
  const dropped: Destination[] = []
  for (const destination of destinations) {
    ;(providerCarries(destination.provider, shape) ? kept : dropped).push(
      destination,
    )
  }
  return { dropped, kept }
}
