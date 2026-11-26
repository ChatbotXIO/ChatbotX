import type {
  SocialPostMediaRow,
  SocialPostRow,
  SocialPostTargetMediaRow,
  SocialPostTargetRow,
  SocialPostTopicRow,
} from "@chatbotx.io/database/repositories"
import {
  type SocialPartRow,
  socialPostRecurrenceRepository,
  socialPostRepository,
} from "@chatbotx.io/database/repositories"
import { resolveTenantSettings } from "../platform/settings"
import { getPublicFileUrl } from "../utils"
import { loadPostGraph } from "./post-graph"
import { toRecurrenceDto } from "./recurrence-dto"
import type {
  SocialPostDto,
  SocialPostMediaDto,
  SocialPostPartDto,
  SocialPostTargetDto,
  SocialPostTopicDto,
} from "./types"

type MediaRow = Pick<
  SocialPostMediaRow,
  | "altText"
  | "durationMs"
  | "height"
  | "id"
  | "kind"
  | "mediaLibraryFileId"
  | "mimeType"
  | "path"
  | "position"
  | "size"
  | "width"
>

const toMediaDto = (row: MediaRow, storageUrl: string): SocialPostMediaDto => ({
  altText: row.altText,
  durationMs: row.durationMs,
  height: row.height,
  id: row.id,
  kind: row.kind,
  mediaLibraryFileId: row.mediaLibraryFileId,
  mimeType: row.mimeType,
  position: row.position,
  size: row.size,
  url: getPublicFileUrl(row.path, storageUrl),
  width: row.width,
})

const groupBy = <Row, Key extends string>(
  rows: readonly Row[],
  keyOf: (row: Row) => Key,
): Map<Key, Row[]> => {
  const grouped = new Map<Key, Row[]>()
  for (const row of rows) {
    const key = keyOf(row)
    grouped.set(key, [...(grouped.get(key) ?? []), row])
  }
  return grouped
}

const toPartDto = (row: SocialPartRow): SocialPostPartDto => ({
  errorCategory: row.errorCategory,
  errorCode: row.errorCode,
  errorMessage: row.errorMessage,
  externalPostId: row.externalPostId,
  id: row.id,
  kind: row.kind,
  permalink: row.permalink,
  position: row.position,
  publishedAt: row.publishedAt,
  status: row.status,
  text: row.text,
})

const toTargetDto = (
  row: SocialPostTargetRow,
  sharedMedia: SocialPostMediaDto[],
  overrides: SocialPostTargetMediaRow[],
  parts: SocialPartRow[],
  storageUrl: string,
): SocialPostTargetDto => ({
  contentType: row.contentType,
  destination: {
    avatar: row.destinationAvatar
      ? getPublicFileUrl(row.destinationAvatar, storageUrl)
      : null,
    id: row.destinationId,
    inboxId: row.inboxId,
    isActive: row.destinationIsActive,
    name: row.destinationName,
    socialAccountId: row.socialAccountId,
    username: row.destinationUsername,
  },
  errorCategory: row.errorCategory,
  errorCode: row.errorCode,
  errorMessage: row.errorMessage,
  externalPostId: row.externalPostId,
  id: row.id,
  media: row.overridesMedia
    ? overrides.map((media) => toMediaDto(media, storageUrl))
    : sharedMedia,
  options: row.options,
  overridesMedia: row.overridesMedia,
  parts: parts.map(toPartDto),
  permalink: row.permalink,
  provider: row.provider,
  publishedAt: row.publishedAt,
  queueSlotAt: row.queueSlotAt,
  removedAt: row.removedAt,
  scheduleMode: row.scheduleMode,
  scheduledAt: row.scheduledAt,
  status: row.status,
  textOverride: row.textOverride,
  timezone: row.timezone,
})

const toTopicDto = (row: SocialPostTopicRow): SocialPostTopicDto => ({
  color: row.color,
  id: row.id,
  name: row.name,
})

/** The post's calendar time: the earliest time among its targets (published, else scheduled). */
const earliestTime = (
  targets: readonly Pick<SocialPostTargetRow, "publishedAt" | "scheduledAt">[],
): Date | null => {
  const times = targets.flatMap((target) => {
    const at = target.publishedAt ?? target.scheduledAt
    return at ? [at.getTime()] : []
  })
  return times.length > 0 ? new Date(Math.min(...times)) : null
}

/**
 * Posts with their targets, files and topics. Four batched reads for the whole
 * page (never one per post), all scoped to the workspace.
 */
export const hydratePosts = async (
  workspaceId: string,
  posts: readonly SocialPostRow[],
): Promise<SocialPostDto[]> => {
  if (posts.length === 0) {
    return []
  }
  const postIds = posts.map((post) => post.id)
  const [graph, topics, recurrences, { storageUrl }] = await Promise.all([
    loadPostGraph(undefined, { postIds, workspaceId }),
    socialPostRepository.listTopics({ postIds, workspaceId }),
    socialPostRecurrenceRepository.listByPosts({ postIds, workspaceId }),
    resolveTenantSettings({ workspaceId }),
  ])
  const { parts, postMedia, targetMedia, targets } = graph
  const partsByTarget = groupBy(parts, (row) => row.socialPostTargetId)

  const mediaByPost = groupBy(postMedia, (row) => row.socialPostId)
  const overridesByTarget = groupBy(
    targetMedia,
    (row) => row.socialPostTargetId,
  )
  const targetsByPost = groupBy(targets, (row) => row.socialPostId)
  const topicsByPost = groupBy(topics, (row) => row.socialPostId)
  const recurrenceByPost = new Map(
    recurrences.map((row) => [row.socialPostId, row]),
  )

  return posts.map((post) => {
    const shared = (mediaByPost.get(post.id) ?? []).map((row) =>
      toMediaDto(row, storageUrl),
    )
    const postTargets = targetsByPost.get(post.id) ?? []
    return {
      completedAt: post.completedAt,
      createdAt: post.createdAt,
      createdById: post.createdById,
      createdVia: post.createdVia,
      id: post.id,
      linkUrl: post.linkUrl,
      media: shared,
      occurrenceAt: post.occurrenceAt,
      parentSocialPostId: post.parentSocialPostId,
      recurrence: toRecurrenceDto(recurrenceByPost.get(post.id) ?? null),
      scheduledAt: earliestTime(postTargets),
      status: post.status,
      targets: postTargets.map((target) =>
        toTargetDto(
          target,
          shared,
          overridesByTarget.get(target.id) ?? [],
          partsByTarget.get(target.id) ?? [],
          storageUrl,
        ),
      ),
      text: post.text,
      topics: (topicsByPost.get(post.id) ?? []).map(toTopicDto),
      updatedAt: post.updatedAt,
    }
  })
}
