import { and, eq, sql } from "../../client"
import type { SocialProvider } from "../../partials/social-account"
import type {
  SocialContentType,
  SocialMediaKind,
  SocialPostBucket,
  SocialPostCreatedVia,
  SocialPostScheduleMode,
  SocialPostStatus,
} from "../../partials/social-post"
import {
  inboxModel,
  publishDestinationModel,
  socialAccountDestinationModel,
  socialAccountModel,
  type socialPostMediaModel,
  socialPostModel,
  type socialPostTargetMediaModel,
  socialPostTargetModel,
} from "../../schema"

/** Statuses a post can still be edited in; once a target is publishing it is frozen. */
export const EDITABLE_POST_STATUSES: readonly SocialPostStatus[] = [
  "draft",
  "scheduled",
]

export type SocialPostInsert = {
  createdById: string | null
  createdVia: SocialPostCreatedVia
  id: string
  idempotencyKey: string | null
  idempotencyRequestHash: string | null
  linkUrl: string | null
  /** An occurrence of a recurring post: its template and the slot it was made for. */
  occurrenceAt?: Date
  parentSocialPostId?: string
  text: string | null
  workspaceId: string
}

export type SocialPostTargetInsert = {
  contentType: SocialContentType
  id: string
  options: Record<string, boolean | string | number>
  overridesMedia: boolean
  provider: SocialProvider
  scheduleMode: SocialPostScheduleMode
  publishDestinationId: string
  socialPostId: string
  textOverride: string | null
  workspaceId: string
}

export type SocialPostTargetPatch = {
  contentType: SocialContentType
  options: Record<string, boolean | string | number>
  overridesMedia: boolean
  textOverride: string | null
}

export type SocialMediaInsert = {
  altText: string | null
  durationMs: number | null
  height: number | null
  id: string
  kind: SocialMediaKind
  mediaLibraryFileId: string | null
  mimeType: string
  path: string
  position: number
  size: number
  width: number | null
  workspaceId: string
}

export type SocialPostListFilters = {
  /** Only posts in this group (see `socialPostBuckets`). */
  bucket?: SocialPostBucket
  /** Posts with a target on one of these destinations. */
  destinationIds?: string[]
  from?: Date
  /** Posts with a target on the destination of one of these inboxes. */
  inboxIds?: string[]
  providers?: SocialProvider[]
  search?: string
  statuses?: SocialPostStatus[]
  to?: Date
  topicIds?: string[]
}

/** Where a post list page stopped: the exact `createdAt` text (microseconds) and the id. */
export type SocialPostListCursor = { createdAt: string; id: string }

// Column maps are built when a query runs, not when the module loads, so a test
// that mocks the schema can still import the repositories.

export const postColumns = () => ({
  completedAt: socialPostModel.completedAt,
  createdAt: socialPostModel.createdAt,
  createdAtText: sql<string>`${socialPostModel.createdAt}::text`,
  createdById: socialPostModel.createdById,
  createdVia: socialPostModel.createdVia,
  id: socialPostModel.id,
  linkUrl: socialPostModel.linkUrl,
  occurrenceAt: socialPostModel.occurrenceAt,
  parentSocialPostId: socialPostModel.parentSocialPostId,
  status: socialPostModel.status,
  text: socialPostModel.text,
  updatedAt: socialPostModel.updatedAt,
  workspaceId: socialPostModel.workspaceId,
})

export const targetColumns = () => ({
  attemptCount: socialPostTargetModel.attemptCount,
  channelPostId: socialPostTargetModel.channelPostId,
  contentType: socialPostTargetModel.contentType,
  destinationAvatar: sql<
    string | null
  >`coalesce(${socialAccountDestinationModel.avatar}, ${publishDestinationModel.avatar})`,
  destinationId: socialPostTargetModel.publishDestinationId,
  destinationIsActive: sql<boolean>`coalesce(${socialAccountDestinationModel.isActive}, ${inboxModel.status} = 'connected', false)`,
  destinationName: sql<string>`coalesce(${inboxModel.name}, ${socialAccountDestinationModel.name})`,
  destinationUsername: socialAccountDestinationModel.username,
  inboxId: publishDestinationModel.inboxId,
  errorCategory: socialPostTargetModel.errorCategory,
  errorCode: socialPostTargetModel.errorCode,
  errorMessage: socialPostTargetModel.errorMessage,
  externalPostId: socialPostTargetModel.externalPostId,
  id: socialPostTargetModel.id,
  nextAttemptAt: socialPostTargetModel.nextAttemptAt,
  options: socialPostTargetModel.options,
  overridesMedia: socialPostTargetModel.overridesMedia,
  permalink: socialPostTargetModel.permalink,
  provider: socialPostTargetModel.provider,
  publishedAt: socialPostTargetModel.publishedAt,
  queueSlotAt: socialPostTargetModel.queueSlotAt,
  removedAt: socialPostTargetModel.removedAt,
  scheduleMode: socialPostTargetModel.scheduleMode,
  scheduledAt: socialPostTargetModel.scheduledAt,
  socialAccountId: socialAccountDestinationModel.socialAccountId,
  socialPostId: socialPostTargetModel.socialPostId,
  status: socialPostTargetModel.status,
  textOverride: socialPostTargetModel.textOverride,
  timezone: socialPostTargetModel.timezone,
})

export const mediaColumns = <
  Table extends typeof socialPostMediaModel | typeof socialPostTargetMediaModel,
>(
  table: Table,
) => ({
  altText: table.altText,
  durationMs: table.durationMs,
  height: table.height,
  id: table.id,
  kind: table.kind,
  mediaLibraryFileId: table.mediaLibraryFileId,
  mimeType: table.mimeType,
  path: table.path,
  position: table.position,
  size: table.size,
  width: table.width,
})

/**
 * The joins from a target to what its destination is, every one filtered by
 * the workspace: the binding, the inbox it binds (Facebook, Instagram,
 * Threads) and the TikTok destination and login it binds. Chain them as
 * `innerJoin(publishDestinationModel, j.binding)`, then `leftJoin` the others.
 */
export const targetDestinationJoins = (workspaceId: string) => ({
  binding: and(
    eq(publishDestinationModel.id, socialPostTargetModel.publishDestinationId),
    eq(publishDestinationModel.workspaceId, workspaceId),
  ),
  inbox: and(
    eq(inboxModel.id, publishDestinationModel.inboxId),
    eq(inboxModel.workspaceId, workspaceId),
  ),
  socialAccount: and(
    eq(socialAccountModel.id, socialAccountDestinationModel.socialAccountId),
    eq(socialAccountModel.workspaceId, workspaceId),
  ),
  socialDestination: and(
    eq(
      socialAccountDestinationModel.id,
      publishDestinationModel.socialAccountDestinationId,
    ),
    eq(socialAccountDestinationModel.workspaceId, workspaceId),
  ),
})

/**
 * What a publish attempt, part or removal reads about the destination of a
 * target. The Meta networks have no account here (`null`): their credential is
 * the inbox's, loaded by `publishCredentialRepository.findCredentialSource`.
 */
export const targetPublishDestinationColumns = () => ({
  accountId: socialAccountDestinationModel.socialAccountId,
  accountStatus: socialAccountModel.status,
  destinationExternalId: socialAccountDestinationModel.externalId,
  destinationId: socialPostTargetModel.publishDestinationId,
  destinationIsActive: sql<boolean>`coalesce(${socialAccountDestinationModel.isActive}, ${inboxModel.status} = 'connected', false)`,
  inboxId: publishDestinationModel.inboxId,
})
