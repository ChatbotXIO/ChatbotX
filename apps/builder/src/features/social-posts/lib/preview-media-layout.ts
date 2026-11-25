import type { SocialProvider } from "@chatbotx.io/database/partials"
import type { SocialContentType } from "@chatbotx.io/utils/social-account"

/** How a network's feed arranges the attached files. */
export const PREVIEW_LAYOUT_KINDS = [
  "none",
  "single",
  "pair",
  "triple",
  "grid",
  "carousel",
  "strip",
  "vertical",
] as const
export type PreviewLayoutKind = (typeof PREVIEW_LAYOUT_KINDS)[number]

export type PreviewMediaLayout = {
  kind: PreviewLayoutKind
  /** Files drawn at once (a carousel draws one slide, a strip draws all). */
  visibleCount: number
  /** Files hidden behind the "+N" tile of a grid. */
  overflowCount: number
}

const GRID_TILES = 4
const LEADING_WWW = /^www\./

const layout = (
  kind: PreviewLayoutKind,
  visibleCount: number,
  overflowCount = 0,
): PreviewMediaLayout => ({ kind, overflowCount, visibleCount })

const facebookLayout = (count: number): PreviewMediaLayout => {
  if (count === 1) {
    return layout("single", 1)
  }
  if (count === 2) {
    return layout("pair", 2)
  }
  if (count === 3) {
    return layout("triple", 3)
  }
  return layout("grid", GRID_TILES, Math.max(0, count - GRID_TILES))
}

const instagramLayout = (
  count: number,
  contentType: SocialContentType | null,
): PreviewMediaLayout => {
  if (contentType === "reel" || contentType === "story") {
    return layout("vertical", 1)
  }
  if (count > 1 || contentType === "carousel") {
    return layout("carousel", count)
  }
  return layout("single", 1)
}

/** The arrangement one network uses for `count` files of the given content type. */
export const previewMediaLayout = (
  provider: SocialProvider,
  contentType: SocialContentType | null,
  count: number,
): PreviewMediaLayout => {
  if (count <= 0) {
    return layout("none", 0)
  }
  switch (provider) {
    case "facebook":
      return facebookLayout(count)
    case "instagram":
      return instagramLayout(count, contentType)
    case "threads":
      return layout("strip", count)
    case "tiktok":
      return layout("vertical", 1)
    default:
      return layout("single", 1)
  }
}

/** The host of a link without a leading `www.`, or `null` when it is not a URL. */
export const linkDomain = (url: string): string | null => {
  try {
    return new URL(url).hostname.replace(LEADING_WWW, "")
  } catch {
    return null
  }
}

/** Moves a carousel index by `step`, wrapping at both ends. */
export const stepSlide = (current: number, step: number, total: number) =>
  total <= 0 ? 0 : (((current + step) % total) + total) % total

type PreviewTabSource = {
  destinationId: string
  provider: SocialProvider
}

export type PreviewTab = {
  avatar: string | null
  destinationId: string
  label: string
  provider: SocialProvider
}

/** One tab per previewed destination, named by the page or profile (never only the network). */
export const previewTabs = (
  items: readonly PreviewTabSource[],
  destinations: ReadonlyMap<
    string,
    { avatar: string | null; name: string; provider: SocialProvider }
  >,
  fallbackLabel: (provider: SocialProvider) => string,
): PreviewTab[] =>
  items.map((item) => {
    const destination = destinations.get(item.destinationId)
    return {
      avatar: destination?.avatar ?? null,
      destinationId: item.destinationId,
      label: destination?.name || fallbackLabel(item.provider),
      provider: item.provider,
    }
  })
