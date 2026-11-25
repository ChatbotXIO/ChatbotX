import type { DatabaseClient } from "@chatbotx.io/database/client"
import type {
  SocialContentType,
  SocialMediaKind,
  SocialProvider,
} from "@chatbotx.io/database/partials"
import {
  type SocialMediaInsert,
  type SocialPostTargetInsert,
  socialPostPartRepository,
  socialPostRepository,
} from "@chatbotx.io/database/repositories"
import { createId } from "@chatbotx.io/utils"
import {
  inferContentType,
  MAX_POST_PARTS,
  type MediaSpec,
  type PartInput,
} from "@chatbotx.io/utils/post-publishing"
import { MAX_TOPICS_PER_POST } from "../channel-post/management.service"
import { validationException } from "../errors"
import { contentTypeIsKnown } from "./evaluate"
import { type MediaImportSession, specsOf, specsOfRows } from "./media"
import { orderedParts, partInserts } from "./parts"
import { earliestSchedule } from "./schedule-policy"
import type {
  SocialMediaInput,
  SocialPostContentInput,
  SocialPostTargetInput,
} from "./types"

/** Most destinations one post can target. */
export const MAX_SOCIAL_POST_TARGETS = 20

/** What the rules need to know about a stored file. */
export type MediaFacts = {
  durationMs: number | null
  kind: SocialMediaKind
  mimeType: string
  size: number
}

/** A destination checked to belong to the workspace, with the request's wishes for it. */
export type PlannedTarget = {
  destination: { id: string; provider: SocialProvider }
  input: SocialPostTargetInput
}

/** A planned target whose own files (if it overrides them) are resolved; its content type may still be open. */
export type ResolvedTarget = {
  explicitContentType: SocialContentType | null
  media: SocialMediaInsert[] | null
  planned: PlannedTarget
}

export type FinalTarget = {
  insert: SocialPostTargetInsert
  media: SocialMediaInsert[] | null
  parts: PartInput[]
}

/** A request validated and resolved, ready to be written. */
export type PreparedPost = {
  content: SocialPostContentInput
  hash: string
  idempotencyKey: string | null
  shared: SocialMediaInsert[]
  socialPostId: string
  targets: FinalTarget[]
}

/** `createInTx` runs inside the caller's transaction, so it never downloads a file. */
export const assertNoUrlImports = (content: SocialPostContentInput): void => {
  const media = [
    ...(content.media ?? []),
    ...content.targets.flatMap((target) => target.media ?? []),
  ]
  if (media.some((file) => file.url)) {
    throw validationException(
      "media",
      "Files must already be in the Media Library",
    )
  }
}

export const cleanText = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

/**
 * A text override keeps two distinct states: `null` (use the post's text) and a
 * string, which may be empty (publish nothing for this destination). Only the
 * whitespace around a string is removed.
 */
export const cleanOverride = (
  value: string | null | undefined,
): string | null =>
  value === null || value === undefined ? null : value.trim()

export const cleanTarget = (
  target: SocialPostTargetInput,
): SocialPostTargetInput => ({
  contentType: target.contentType,
  destinationId: target.destinationId,
  firstComment: target.firstComment
    ? { text: target.firstComment.text.trim() }
    : null,
  media: target.media ?? null,
  options: target.options ?? {},
  parts: (target.parts ?? []).map((part) => ({ text: part.text.trim() })),
  text: cleanOverride(target.text),
})

export const uniqueSorted = (ids: readonly string[] | undefined): string[] =>
  [...new Set(ids ?? [])].sort()

/** The request as it is stored: trimmed and defaulted, so two spellings of one request behave alike. */
export const normaliseContent = (
  content: SocialPostContentInput,
): SocialPostContentInput => ({
  linkUrl: cleanText(content.linkUrl),
  media: content.media ?? [],
  targets: content.targets.map(cleanTarget),
  text: cleanText(content.text),
  topicIds: uniqueSorted(content.topicIds),
})

export const canonicalMedia = (media: SocialMediaInput) => ({
  altText: media.altText ?? null,
  mediaLibraryFileId: media.mediaLibraryFileId ?? null,
  url: media.url ?? null,
})

/**
 * What an idempotency hash covers: every field with an explicit `null` for an
 * absent one, so a request that spells a default out hashes the same as one
 * that leaves it off. The text override keeps `null` (inherit) apart from an
 * explicit empty string.
 */
export const canonicalRequest = (content: SocialPostContentInput) => ({
  linkUrl: content.linkUrl ?? null,
  media: (content.media ?? []).map(canonicalMedia),
  targets: content.targets.map((target) => ({
    contentType: target.contentType ?? null,
    destinationId: target.destinationId,
    media: target.media ? target.media.map(canonicalMedia) : null,
    options: target.options ?? {},
    text: cleanOverride(target.text),
    // Present only when used, so a post made before parts existed hashes as it did.
    ...(orderedParts(target).length > 0 ? { parts: orderedParts(target) } : {}),
  })),
  text: content.text ?? null,
  topicIds: uniqueSorted(content.topicIds),
})

export const assertShape = (content: SocialPostContentInput): void => {
  if (content.targets.length === 0) {
    throw validationException("targets", "Choose at least one destination")
  }
  if (content.targets.length > MAX_SOCIAL_POST_TARGETS) {
    throw validationException(
      "targets",
      `At most ${MAX_SOCIAL_POST_TARGETS} destinations per post`,
    )
  }
  for (const target of content.targets) {
    if (orderedParts(target).length > MAX_POST_PARTS) {
      throw validationException(
        "targets",
        `At most ${MAX_POST_PARTS} follow-up parts per destination`,
      )
    }
  }
  const destinationIds = content.targets.map((target) => target.destinationId)
  if (new Set(destinationIds).size !== destinationIds.length) {
    throw validationException("targets", "A destination can appear only once")
  }
}

/** Topics are de-duplicated first, so a repeated id is neither a false "not found" nor a way past the cap. */
export const assertTopicCount = (topicIds: readonly string[]): void => {
  if (topicIds.length > MAX_TOPICS_PER_POST) {
    throw validationException(
      "topicIds",
      `At most ${MAX_TOPICS_PER_POST} topics per post`,
    )
  }
}

export type InheritedSchedule = { scheduledAt: Date; timezone: string | null }

/**
 * A destination added to a scheduled post publishes at the time of the post's
 * earliest waiting destination, as a custom time, when that time is still
 * ahead. A draft has no time to inherit.
 */
export const inheritedSchedule = (
  targets: readonly {
    nextAttemptAt: Date | null
    scheduledAt: Date | null
    timezone: string | null
  }[],
): InheritedSchedule | null => {
  const horizon = earliestSchedule(new Date()).getTime()
  const waiting = targets
    .flatMap((target) =>
      target.scheduledAt &&
      target.nextAttemptAt &&
      target.scheduledAt.getTime() > horizon
        ? [{ scheduledAt: target.scheduledAt, timezone: target.timezone }]
        : [],
    )
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())
  return waiting[0] ?? null
}

export const withIds = (rows: SocialMediaInsert[]): SocialMediaInsert[] =>
  rows.map((row) => ({ ...row, id: createId() }))

/**
 * Checks, before anything is imported, the structural facts a post needs even
 * as a draft: every destination belongs to the workspace and the content type
 * (given, or derived from the files the request names) exists for its
 * network. Content rules (text length, file formats) are reported by
 * `validate` and enforced when the post is scheduled, not on a draft.
 */
export const planTargets = async (input: {
  hasLink: boolean
  sharedMedia: readonly MediaSpec[]
  targets: readonly SocialPostTargetInput[]
  workspaceId: string
}): Promise<PlannedTarget[]> => {
  const { workspaceId } = input
  const destinations = await socialPostRepository.findDestinations({
    ids: input.targets.map((target) => target.destinationId),
    workspaceId,
  })
  const byId = new Map(destinations.map((row) => [row.id, row]))
  const planned: PlannedTarget[] = []
  for (const target of input.targets) {
    const destination = byId.get(target.destinationId)
    if (!destination) {
      throw validationException("targets", "A destination was not found")
    }
    const media = target.media
      ? await specsOf(workspaceId, target.media as SocialMediaInput[])
      : input.sharedMedia
    const contentType =
      target.contentType ??
      inferContentType({
        hasLink: input.hasLink,
        media,
        provider: destination.provider,
      })
    if (!contentTypeIsKnown(destination.provider, contentType)) {
      throw validationException(
        "targets",
        `${destination.provider} does not publish ${contentType}`,
      )
    }
    planned.push({
      destination: { id: destination.id, provider: destination.provider },
      input: target,
    })
  }
  return planned
}

/** Resolves each destination's own files (imports included); the content type stays open until the shared files are known. */
export const materialise = async (
  session: MediaImportSession,
  planned: readonly PlannedTarget[],
): Promise<ResolvedTarget[]> => {
  const resolved: ResolvedTarget[] = []
  for (const target of planned) {
    resolved.push({
      explicitContentType: target.input.contentType ?? null,
      media: target.input.media
        ? await session.resolve(target.input.media as SocialMediaInput[])
        : null,
      planned: target,
    })
  }
  return resolved
}

/**
 * Settles every target's content type with the files and link as they will be
 * stored (an inferred type follows the real file kinds, not an extension
 * guess) and builds the rows. Pure: no database or network call.
 */
export const finalise = (input: {
  hasLink: boolean
  resolved: readonly ResolvedTarget[]
  sharedMedia: readonly MediaFacts[]
  socialPostId: string
  workspaceId: string
}): FinalTarget[] =>
  input.resolved.map((target) => {
    const { destination } = target.planned
    const contentType =
      target.explicitContentType ??
      inferContentType({
        hasLink: input.hasLink,
        media: specsOfRows(target.media ?? input.sharedMedia),
        provider: destination.provider,
      })
    if (!contentTypeIsKnown(destination.provider, contentType)) {
      throw validationException(
        "targets",
        `${destination.provider} does not publish ${contentType}`,
      )
    }
    return {
      insert: {
        contentType,
        id: createId(),
        options: target.planned.input.options ?? {},
        overridesMedia: target.media !== null,
        provider: destination.provider,
        scheduleMode: "custom",
        publishDestinationId: destination.id,
        socialPostId: input.socialPostId,
        textOverride: target.planned.input.text ?? null,
        workspaceId: input.workspaceId,
      },
      media: target.media,
      parts: orderedParts(target.planned.input),
    }
  })

export const assertTopics = async (
  workspaceId: string,
  topicIds: readonly string[],
): Promise<void> => {
  assertTopicCount(topicIds)
  if (topicIds.length === 0) {
    return
  }
  const found = await socialPostRepository.findTopicIds({
    ids: [...topicIds],
    workspaceId,
  })
  if (found.length !== topicIds.length) {
    throw validationException("topicIds", "A topic was not found")
  }
}

export const writeChildren = async (
  tx: DatabaseClient,
  input: {
    shared: SocialMediaInsert[]
    socialPostId: string
    targets: FinalTarget[]
    topicIds: readonly string[]
  },
): Promise<void> => {
  await socialPostRepository.insertTargets(
    input.targets.map((target) => target.insert),
    tx,
  )
  await socialPostRepository.insertPostMedia(
    { rows: input.shared, socialPostId: input.socialPostId },
    tx,
  )
  for (const target of input.targets) {
    if (target.media) {
      await socialPostRepository.insertTargetMedia(
        { rows: target.media, socialPostTargetId: target.insert.id },
        tx,
      )
    }
    await socialPostPartRepository.insertMany(
      partInserts({
        parts: target.parts,
        socialPostTargetId: target.insert.id,
        workspaceId: target.insert.workspaceId,
      }),
      tx,
    )
  }
  await socialPostRepository.replaceTopics(
    { postTopicIds: [...input.topicIds], socialPostId: input.socialPostId },
    tx,
  )
}
