import type { SocialProvider } from "@chatbotx.io/database/partials"
import { inferContentType } from "@chatbotx.io/utils/post-publishing"
import type { SocialContentType } from "@chatbotx.io/utils/social-account"
import type { z } from "zod"
import type { ListFilesResponse } from "@/features/media-library/schema"
import type {
  listSocialPostContentTypesResponse,
  previewSocialPostResponse,
  socialPostContentInput,
  socialPostIssueResource,
  socialPostMediaResource,
  socialPostOptions,
  socialPostResource,
} from "../schema"
import {
  type PublishDestinationGroup,
  selectableDestinations,
} from "./publish-destination-options"

/** The request body the composer sends to `validate`, `preview`, `create` and `update`. */
export type ComposerContent = z.input<typeof socialPostContentInput>
export type ComposerPost = z.infer<typeof socialPostResource>
export type ComposerIssue = z.infer<typeof socialPostIssueResource>
export type ComposerPreviewItem = z.infer<
  typeof previewSocialPostResponse
>["items"][number]
export type ComposerNetworkRules = z.infer<
  typeof listSocialPostContentTypesResponse
>["items"][number]
export type ComposerContentTypeRule =
  ComposerNetworkRules["contentTypes"][number]
export type ComposerOptions = z.infer<typeof socialPostOptions>
type ComposerMediaResource = z.infer<typeof socialPostMediaResource>

/** A file attached to the post. `id` is its Media Library id; `null` for a file only known by URL. */
export type ComposerMedia = {
  id: string | null
  kind: ComposerMediaResource["kind"]
  mimeType: string
  name: string
  url: string
}

/** What one destination publishes. Until `customised`, it follows the shared content. */
export type ComposerTarget = {
  contentType: SocialContentType | null
  customised: boolean
  destinationId: string
  /** The first comment's text; empty = none. */
  firstComment: string
  /** The destination's own files, kept as they are; the composer does not edit them. `null` = the shared files. */
  media: ComposerMedia[] | null
  options: ComposerOptions
  /** Thread parts, in order. Apply whether or not the target is customised. */
  parts: string[]
  /** A time of its own for this destination (an instant); `null` follows the post's time. */
  scheduledAt: Date | null
  text: string
}

export type ComposerTopic = { color: string | null; id: string; name: string }

export type ComposerState = {
  linkUrl: string
  media: ComposerMedia[]
  /** A signature snippet the server appends once when a new post is created. */
  signatureId: string | null
  targets: ComposerTarget[]
  text: string
  topics: ComposerTopic[]
}

export const EMPTY_COMPOSER_STATE: ComposerState = {
  linkUrl: "",
  media: [],
  signatureId: null,
  targets: [],
  text: "",
  topics: [],
}

export type LibraryFile = ListFilesResponse["data"][number]

/** A Media Library file as a post file. */
export const fromLibraryFile = (file: LibraryFile): ComposerMedia => ({
  id: file.id,
  kind: file.mimeType.startsWith("video/") ? "video" : "image",
  mimeType: file.mimeType,
  name: file.name,
  url: file.url,
})

type MediaInput = NonNullable<ComposerContent["media"]>[number]

const toMediaInput = (media: ComposerMedia): MediaInput =>
  media.id ? { mediaLibraryFileId: media.id } : { url: media.url }

const fromMediaResource = (media: ComposerMediaResource): ComposerMedia => ({
  id: media.mediaLibraryFileId,
  kind: media.kind,
  mimeType: media.mimeType,
  name: media.url.split("/").pop() ?? media.url,
  url: media.url,
})

/** The shape of the request for the current state. Empty strings become `null`. */
export const buildContent = (state: ComposerState): ComposerContent => ({
  linkUrl: state.linkUrl.trim() || null,
  media: state.media.map(toMediaInput),
  targets: state.targets.map((target) => ({
    contentType: target.contentType ?? undefined,
    destinationId: target.destinationId,
    firstComment: target.firstComment.trim()
      ? { text: target.firstComment.trim() }
      : null,
    media: target.media ? target.media.map(toMediaInput) : null,
    options: target.options,
    parts: target.parts.map((text) => ({ text })),
    scheduledAt: target.scheduledAt?.toISOString(),
    text: target.customised ? target.text || null : null,
  })),
  text: state.text || null,
  topicIds: state.topics.map((topic) => topic.id),
})

/**
 * The stored content type when the files and link would not give it back (a
 * Story, a Facebook Reel...), so a save keeps it; `null` when the server
 * infers the same one, so the target keeps following its files.
 */
const pinnedContentType = (
  post: ComposerPost,
  target: ComposerPost["targets"][number],
): SocialContentType | null =>
  target.contentType ===
  inferContentType({
    hasLink: Boolean(post.linkUrl),
    media: target.media.map((media) => ({
      durationMs: null,
      kind: media.kind,
      mimeType: media.mimeType,
      size: null,
    })),
    provider: target.provider,
  })
    ? null
    : target.contentType

/**
 * The time a waiting destination keeps of its own: only when the post's
 * destinations wait for different times (a shared time stays the post's), and
 * still far enough ahead to be sent again.
 */
const ownTime = (
  post: ComposerPost,
  target: ComposerPost["targets"][number],
): Date | null => {
  const times = new Set(
    post.targets.flatMap((item) =>
      item.status === "pending" && item.scheduledAt
        ? [item.scheduledAt.getTime()]
        : [],
    ),
  )
  return target.status === "pending" &&
    target.scheduledAt &&
    times.size > 1 &&
    isTargetTimeValid(target.scheduledAt)
    ? target.scheduledAt
    : null
}

/** The editable state of a saved post. */
export const stateFromPost = (post: ComposerPost): ComposerState => ({
  linkUrl: post.linkUrl ?? "",
  media: post.media.map(fromMediaResource),
  signatureId: null,
  targets: post.targets.map((target) => ({
    contentType: pinnedContentType(post, target),
    customised:
      target.textOverride !== null ||
      Object.keys(target.options).length > 0 ||
      target.overridesMedia ||
      pinnedContentType(post, target) !== null,
    destinationId: target.destination.id,
    firstComment:
      target.parts.find((part) => part.kind === "firstComment")?.text ?? "",
    media: target.overridesMedia ? target.media.map(fromMediaResource) : null,
    options: target.options,
    parts: target.parts
      .filter((part) => part.kind === "threadPart")
      .map((part) => part.text),
    scheduledAt: ownTime(post, target),
    text: target.textOverride ?? "",
  })),
  text: post.text ?? "",
  topics: post.topics,
})

/** Adds the destination, or removes it when it is already selected. */
export const toggleDestination = (
  state: ComposerState,
  destinationId: string,
): ComposerState => {
  const isSelected = state.targets.some(
    (target) => target.destinationId === destinationId,
  )
  return {
    ...state,
    targets: isSelected
      ? state.targets.filter((target) => target.destinationId !== destinationId)
      : [
          ...state.targets,
          {
            contentType: null,
            customised: false,
            destinationId,
            firstComment: "",
            media: null,
            options: {},
            parts: [],
            scheduledAt: null,
            text: "",
          },
        ],
  }
}

/** Replaces one destination's draft; the other drafts are kept. */
export const updateTarget = (
  state: ComposerState,
  destinationId: string,
  changes: Partial<ComposerTarget>,
): ComposerState => ({
  ...state,
  targets: state.targets.map((target) =>
    target.destinationId === destinationId ? { ...target, ...changes } : target,
  ),
})

/**
 * Writes each network's version into the "Customise for this channel" text of
 * that network's targets, turning customise on for them. Targets of other
 * networks, and the shared text, are left as they are. The shared text is the
 * fallback for any network without a version.
 */
export const applyTextPerProvider = (
  state: ComposerState,
  versions: readonly { provider: SocialProvider; text: string }[],
  providerOf: (destinationId: string) => SocialProvider | undefined,
): ComposerState => ({
  ...state,
  targets: state.targets.map((target) => {
    const provider = providerOf(target.destinationId)
    const version = versions.find((item) => item.provider === provider)
    return version
      ? { ...target, customised: true, text: version.text }
      : target
  }),
})

/** Appends a hashtag to the shared text, on the same line when there is text. */
export const appendHashtag = (text: string, tag: string): string =>
  text.trim() ? `${text.trimEnd()} ${tag}` : tag

/** The smallest text limit among the previewed destinations, or `null` when none has one. */
export const strictestMaxCharacters = (
  items: readonly ComposerPreviewItem[],
): number | null => {
  const limits = items.flatMap((item) =>
    item.maxCharacters === null ? [] : [item.maxCharacters],
  )
  return limits.length > 0 ? Math.min(...limits) : null
}

/**
 * The largest file count any selected destination's content type accepts, or
 * `null` when none of them takes files (a text-only selection must still be
 * able to receive its first file, which changes the inferred type).
 */
export const largestMaxMedia = (
  limits: readonly (number | undefined)[],
): number | null => {
  const known = limits.filter((limit): limit is number => limit !== undefined)
  const largest = known.length > 0 ? Math.max(...known) : 0
  return largest > 0 ? largest : null
}

export const issuesOfDestination = (
  issues: readonly ComposerIssue[],
  destinationId: string,
): ComposerIssue[] =>
  issues.filter((issue) => issue.destinationId === destinationId)

const MIN_TARGET_LEAD_MS = 2 * 60 * 1000
const MAX_TARGET_LEAD_MS = 365 * 24 * 60 * 60 * 1000

/** A destination's own time must be 2 minutes to one year ahead, like the post's. */
export const isTargetTimeValid = (
  at: Date,
  now: number = Date.now(),
): boolean =>
  at.getTime() >= now + MIN_TARGET_LEAD_MS &&
  at.getTime() <= now + MAX_TARGET_LEAD_MS

/** Whether any destination has a time of its own. */
export const hasTargetTimes = (state: ComposerState): boolean =>
  state.targets.some((target) => target.scheduledAt !== null)

/** Whether every destination's own time is acceptable. */
export const areTargetTimesValid = (state: ComposerState): boolean =>
  state.targets.every(
    (target) =>
      target.scheduledAt === null || isTargetTimeValid(target.scheduledAt),
  )

/** Whether every destination of the request carries its own time (scheduling without a shared time). */
export const everyTargetTimed = (content: ComposerContent): boolean => {
  const targets = content.targets ?? []
  return (
    targets.length > 0 && targets.every((target) => Boolean(target.scheduledAt))
  )
}

/** The request without the destinations' own times: a draft keeps none. */
export const withoutTargetTimes = (
  content: ComposerContent,
): ComposerContent => ({
  ...content,
  targets: content.targets?.map(
    ({ scheduledAt: _scheduledAt, ...target }) => target,
  ),
})

/** A post can only be saved when it names at least one destination and every own time is acceptable. */
export const canSaveComposer = (state: ComposerState): boolean =>
  state.targets.length > 0 && areTargetTimesValid(state)

export { PROVIDER_LABELS } from "@/features/social-accounts/lib/connections"

/** A link the API accepts: an absolute http(s) URL. An empty link is fine too. */
export const isLinkValid = (linkUrl: string): boolean => {
  const trimmed = linkUrl.trim()
  if (!trimmed) {
    return true
  }
  try {
    const { protocol } = new URL(trimmed)
    return protocol === "https:" || protocol === "http:"
  } catch {
    return false
  }
}

/**
 * A new post starts with the destination chosen when there is exactly one it
 * can publish to, so a single-destination workspace skips the picker.
 */
export const preselectSingleDestination = (
  groups: readonly PublishDestinationGroup[],
): ComposerState => {
  const usable = selectableDestinations(groups)
  const only = usable.length === 1 ? usable[0] : undefined
  return only
    ? toggleDestination(EMPTY_COMPOSER_STATE, only.id)
    : EMPTY_COMPOSER_STATE
}

/**
 * What is locked on the post page. The content is read-only when the post can
 * no longer be edited (published, failed...) or the workspace is blocked. The
 * per-target actions (retry, mark published, remove from channels) are only
 * locked by the blocked workspace: they exist precisely for posts whose
 * content is no longer editable, and the server refuses them with 402
 * `workspaceBlocked` on an expired plan.
 */
export const resolveComposerLocks = ({
  editable,
  workspaceReadOnly,
}: {
  editable: boolean
  workspaceReadOnly: boolean
}): { actionsDisabled: boolean; contentReadOnly: boolean } => ({
  actionsDisabled: workspaceReadOnly,
  contentReadOnly: workspaceReadOnly || !editable,
})
