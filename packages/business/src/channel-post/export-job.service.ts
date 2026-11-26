import {
  CONTACT_EXPORT_RETENTION_DAYS,
  type ExportFailureReason,
  exportSubTypes,
  type FileStatus,
  fileContextTypes,
  fileStatuses,
} from "@chatbotx.io/database/partials"
import {
  channelPostRepository,
  fileRepository,
} from "@chatbotx.io/database/repositories"
import type { FileMeta } from "@chatbotx.io/database/schema"
import { uploader } from "@chatbotx.io/filesystem"
import { distributedStore } from "@chatbotx.io/redis"
import { createId } from "@chatbotx.io/utils"
import {
  isPostManagementChannel,
  POST_CHANNEL_CAPABILITIES,
} from "@chatbotx.io/utils/channel"
import {
  channelPostMetricBits,
  hasMetricBit,
} from "@chatbotx.io/utils/post-metrics"
import {
  ChannelPostExportJobAction,
  channelPostExportQueue,
  exportChannelPostCommentsJobId,
} from "@chatbotx.io/worker-config"
import { BaseService } from "../base.service"
import {
  conflictException,
  notFoundException,
  validationException,
} from "../errors"
import { logger } from "../logger"
import { messageUsageService } from "../message-usage/service"
import { MAX_MERGE_VIEW_POSTS } from "./comments.service"
import {
  CHANNEL_POST_EXPORT_LOCK_MARGIN_MS,
  CHANNEL_POST_EXPORT_MAX_DURATION_MS,
  CHANNEL_POST_EXPORT_MAX_QUEUE_WAIT_MS,
  CHANNEL_POST_EXPORT_MAX_RUNNING_PER_WORKSPACE,
  CHANNEL_POST_EXPORT_RUNNING_SCAN_LIMIT,
} from "./export-job.config"
import {
  CHANNEL_POST_EXPORT_KINDS,
  type ChannelPostCommentExportKind,
  forbiddenException,
  isChannelPostCommentExportKind,
  mayExportKind,
} from "./export-kinds"

/** Error code of a start refused because a post's channel cannot be read for its comments. */
export const COMMENT_EXPORT_UNSUPPORTED_CODE = "commentExportUnsupported"

/**
 * The rows the export is expected to hold: the posts' stored comment counts
 * added up, or `null` (unknown) when any post never had its count reported (a
 * stored 0 would read as "no comments").
 */
const expectedRecordsOf = (
  posts: { commentsCount: number; metricsKnownMask: number }[],
): number | null =>
  posts.every((post) =>
    hasMetricBit(post.metricsKnownMask, channelPostMetricBits.comments),
  )
    ? posts.reduce((sum, post) => sum + post.commentsCount, 0)
    : null

/** How long a finished export is kept; it shares the contact-export retention. */
const RETENTION_MS = CONTACT_EXPORT_RETENTION_DAYS * 24 * 60 * 60 * 1000
/** Lifetime of a signed download link. */
const DOWNLOAD_URL_TTL_SECONDS = 300

/** A post the export job reads: where to read it and what the file calls it. */
export type ChannelPostExportTarget = {
  channel: string
  externalPostId: string
  id: string
  inboxId: string
  /** What the file calls the post: its caption, else its channel id. */
  label: string
}

export type ChannelPostCommentExportStatus = {
  downloadUrl: string | null
  /** When the retention sweep deletes the file. */
  expiresAt: Date
  /** An estimate from the posts' stored comment counts, never exact; `null` when unknown. */
  expectedRows: number | null
  failureReason: ExportFailureReason | null
  fileId: string
  fileName: string
  kind: ChannelPostCommentExportKind
  /** Rows written so far (final once settled). */
  rowCount: number
  status: FileStatus
  /** The export stopped at a safety ceiling: the file is incomplete. */
  truncated: boolean
}

export type StartedChannelPostCommentExport = {
  fileId: string
  status: FileStatus
}

/**
 * The start lock of one export: workspace + kind + whether the file holds
 * contact data + the sorted post ids. A caller who may see contact data and one
 * who may not never share a run: the file of the first is unmasked.
 */
export const channelPostExportLockKey = (input: {
  containsContactData: boolean
  kind: ChannelPostCommentExportKind
  postIds: string[]
  workspaceId: string
}): string =>
  `channel-post-export:${input.workspaceId}:${input.kind}:${input.containsContactData ? "full" : "masked"}:${[...input.postIds].sort().join(",")}`

const LOCK_TTL_SECONDS = Math.ceil(
  (CHANNEL_POST_EXPORT_MAX_DURATION_MS + CHANNEL_POST_EXPORT_LOCK_MARGIN_MS) /
    1000,
)

/**
 * A file still `pending` belongs to a job that died or stalled when its last
 * sign of life is too old: a job that started (it has a heartbeat) is stale
 * after the lock's TTL without one; a job that never started is stale only
 * after {@link CHANNEL_POST_EXPORT_MAX_QUEUE_WAIT_MS} from the file's creation,
 * since it may wait behind running exports for longer than the lock lives.
 * Only for reading a status and counting running exports: the job itself never
 * judges its own file by the heartbeat (the wall-time ceiling counts from the
 * job's pickup, which may be long after the file was created).
 */
const isStalePending = (file: {
  createdAt: Date
  meta: FileMeta | null
  status: FileStatus
}) => {
  if (file.status !== fileStatuses.enum.pending) {
    return false
  }
  const heartbeat = file.meta?.heartbeatAt
    ? Date.parse(file.meta.heartbeatAt)
    : Number.NaN
  if (Number.isNaN(heartbeat)) {
    return (
      Date.now() - file.createdAt.getTime() >
      CHANNEL_POST_EXPORT_MAX_QUEUE_WAIT_MS
    )
  }
  return Date.now() - heartbeat > LOCK_TTL_SECONDS * 1000
}

/**
 * Whether the file's link needs the email-and-phone permission: it holds
 * contact data (the snapshot taken at the start), or its kind lists it (files
 * written before the snapshot existed).
 */
const needsContactPermission = (
  file: ExportFile,
  kind: ChannelPostCommentExportKind,
): boolean =>
  file.meta?.containsContactData ??
  CHANNEL_POST_EXPORT_KINDS[kind].requiresEmailAndPhone

type ExportFile = NonNullable<
  Awaited<ReturnType<typeof fileRepository.findByIdForWorkspace>>
>

/** A holder that still runs: pending and not stale. */
const isLive = (file: {
  createdAt: Date
  meta: FileMeta | null
  status: FileStatus
}): boolean =>
  file.status === fileStatuses.enum.pending && !isStalePending(file)

/** The start lock key of a stored export file, or `null` when its meta lacks the selection. */
const lockKeyOfFile = (
  file: { meta: FileMeta | null },
  workspaceId: string,
): string | null => {
  const kind = file.meta?.kind
  const postIds = file.meta?.sourceIds
  if (!(isChannelPostCommentExportKind(kind) && postIds)) {
    return null
  }
  return channelPostExportLockKey({
    containsContactData: file.meta?.containsContactData ?? false,
    kind,
    postIds,
    workspaceId,
  })
}

const isChannelPostExportFile = (file: ExportFile): boolean =>
  file.contextType === fileContextTypes.enum.export &&
  file.subType === exportSubTypes.enum.channelPostComments

class ChannelPostCommentExportService extends BaseService {
  /**
   * Starts a background export of the comments of the given posts, read from
   * the channel itself. Validates the posts (workspace-scoped, one channel
   * each that can be read), the permission for contact data and the owner's
   * message quota, then takes an atomic start lock keyed by workspace, kind
   * and posts: a second start while one runs answers with the running file
   * instead of reading everything twice.
   */
  async start(input: {
    canViewEmailAndPhone: boolean
    kind: ChannelPostCommentExportKind
    postIds: string[]
    userId: string | null
    workspaceId: string
  }): Promise<StartedChannelPostCommentExport> {
    const { canViewEmailAndPhone, kind, userId, workspaceId } = input
    const postIds = Array.from(new Set(input.postIds))
    if (postIds.length === 0 || postIds.length > MAX_MERGE_VIEW_POSTS) {
      throw validationException(
        "postIds",
        `Export between 1 and ${MAX_MERGE_VIEW_POSTS} posts.`,
      )
    }
    if (!mayExportKind(kind, canViewEmailAndPhone)) {
      throw forbiddenException()
    }

    const posts = await channelPostRepository.findByIds({
      ids: postIds,
      workspaceId,
    })
    if (posts.length !== postIds.length) {
      throw notFoundException("Post not found")
    }
    for (const post of posts) {
      if (
        !(
          isPostManagementChannel(post.channel) &&
          POST_CHANNEL_CAPABILITIES[post.channel].commentExport
        )
      ) {
        throw conflictException(
          "The comments of this channel cannot be read from the channel.",
          COMMENT_EXPORT_UNSUPPORTED_CODE,
        )
      }
    }
    await messageUsageService.assertRoom(workspaceId)

    const lockKey = channelPostExportLockKey({
      containsContactData: canViewEmailAndPhone,
      kind,
      postIds,
      workspaceId,
    })
    const fileId = createId()
    const sameSelection = await this.enforceRunningCap(lockKey, workspaceId)
    if (sameSelection) {
      return sameSelection
    }
    const running = await this.claimOrFindRunning(lockKey, fileId, workspaceId)
    if (running) {
      return running
    }

    try {
      return await this.createAndEnqueue({
        canViewEmailAndPhone,
        expectedRecords: expectedRecordsOf(posts),
        fileId,
        kind,
        postIds,
        userId,
        workspaceId,
      })
    } catch (error) {
      await this.failFile({ fileId, reason: "failed", workspaceId }).catch(
        () => undefined,
      )
      await distributedStore.releaseKeyIfOwner(lockKey, fileId)
      throw error
    }
  }

  /** The export's state, with a fresh signed link once it is uploaded. */
  async getStatus(input: {
    canViewEmailAndPhone: boolean
    fileId: string
    workspaceId: string
  }): Promise<ChannelPostCommentExportStatus> {
    const file = await fileRepository.findByIdForWorkspace({
      id: input.fileId,
      workspaceId: input.workspaceId,
    })
    const kind = file?.meta?.kind
    if (
      !(
        file &&
        isChannelPostExportFile(file) &&
        isChannelPostCommentExportKind(kind)
      )
    ) {
      throw notFoundException("Export file not found")
    }
    const isUploaded = file.status === fileStatuses.enum.uploaded
    if (
      isUploaded &&
      !input.canViewEmailAndPhone &&
      needsContactPermission(file, kind)
    ) {
      // Re-checked at link time, for every kind: the permission may have been
      // taken away since the start, or the file may be another caller's.
      throw forbiddenException()
    }
    const isStale = isStalePending(file)
    return {
      downloadUrl: isUploaded
        ? await uploader.getPresignedDownload(
            file.path,
            DOWNLOAD_URL_TTL_SECONDS,
          )
        : null,
      expectedRows: file.meta?.expectedRecords ?? null,
      expiresAt: new Date(file.createdAt.getTime() + RETENTION_MS),
      failureReason: isStale ? "failed" : (file.meta?.failureReason ?? null),
      fileId: file.id,
      fileName: file.fileName,
      kind,
      rowCount: file.meta?.totalRecords ?? 0,
      // A job that died leaves the row pending: it reads as failed, no write.
      status: isStale ? fileStatuses.enum.failed : file.status,
      truncated: file.meta?.truncated ?? false,
    }
  }

  /**
   * The posts the job reads, in the order they were asked for. A post removed
   * since the start is missing from the result (the job fails the file with
   * `postNotFound`).
   */
  async resolveTargets(input: {
    postIds: string[]
    workspaceId: string
  }): Promise<ChannelPostExportTarget[]> {
    const posts = await channelPostRepository.findByIds({
      ids: input.postIds,
      workspaceId: input.workspaceId,
    })
    const byId = new Map(posts.map((post) => [post.id, post]))
    return input.postIds.flatMap((id) => {
      const post = byId.get(id)
      return post
        ? [
            {
              channel: post.channel,
              externalPostId: post.externalPostId,
              id: post.id,
              inboxId: post.inboxId,
              label: post.caption || post.externalPostId,
            },
          ]
        : []
    })
  }

  /**
   * Whether the file is still `pending`, the raw status (a job that runs again
   * after settling must do nothing). Never stale-aware: a late-picked-up job
   * still owns its file however old the row is.
   */
  async isPending(input: {
    fileId: string
    workspaceId: string
  }): Promise<boolean> {
    const file = await fileRepository.findByIdForWorkspace({
      id: input.fileId,
      workspaceId: input.workspaceId,
    })
    return file?.status === fileStatuses.enum.pending
  }

  /**
   * The job's start check. Returns `true` only for the execution that claims
   * the file's first run: the file is `pending` and no execution has stamped a
   * heartbeat yet, decided by one atomic update, so a stalled-job recovery that
   * starts a second execution while the first still works gets `false` (it
   * must not read or upload; if the first died, the stale heartbeat reads as
   * failed). The wall-time ceiling counts from this pickup. A file that waited
   * in the queue past {@link CHANNEL_POST_EXPORT_MAX_QUEUE_WAIT_MS} without ever
   * starting is failed instead (a lost job; its lock expired long ago). The
   * winner then renews its start lock, re-taking it when it lapsed; if another
   * export holds it now, this one is failed and stops (no charge).
   */
  async beginRun(input: {
    fileId: string
    workspaceId: string
  }): Promise<boolean> {
    const file = await fileRepository.findByIdForWorkspace({
      id: input.fileId,
      workspaceId: input.workspaceId,
    })
    if (file?.status !== fileStatuses.enum.pending || file.meta?.heartbeatAt) {
      return false
    }
    if (isStalePending(file)) {
      await this.fail({ ...input, reason: "failed" })
      return false
    }
    const claimed = await fileRepository.claimFirstRunForWorkspace({
      id: input.fileId,
      values: {
        meta: { ...file.meta, heartbeatAt: new Date().toISOString() },
      },
      workspaceId: input.workspaceId,
    })
    if (!claimed) {
      return false
    }
    if (!(await this.holdLock(file, input.fileId, input.workspaceId))) {
      logger.warn(
        { fileId: input.fileId },
        "channelPostExport: another export holds the start lock, stopping",
      )
      await this.fail({ ...input, reason: "failed" })
      return false
    }
    return true
  }

  /**
   * Persists the rows written so far and keeps the start lock alive: a read
   * that outlasts the lock's TTL (one slow page, a long export) must not let a
   * second run start. Returns `false` when this export lost the lock to
   * another one (the caller must stop: two exports would charge twice). A
   * Redis error is not lost ownership: it is logged and the run continues.
   */
  async recordProgress(input: {
    canViewEmailAndPhone: boolean
    fileId: string
    kind: ChannelPostCommentExportKind
    postIds: string[]
    rowCount: number
    workspaceId: string
  }): Promise<boolean> {
    await this.patchPendingFile(input, {
      meta: {
        heartbeatAt: new Date().toISOString(),
        totalRecords: input.rowCount,
      },
    })
    return await this.holdLockKey(
      channelPostExportLockKey({
        containsContactData: input.canViewEmailAndPhone,
        kind: input.kind,
        postIds: input.postIds,
        workspaceId: input.workspaceId,
      }),
      input.fileId,
    )
  }

  /** {@link holdLockKey} for the lock of a file row. */
  private async holdLock(
    file: ExportFile,
    fileId: string,
    workspaceId: string,
  ): Promise<boolean> {
    const key = lockKeyOfFile(file, workspaceId)
    if (key === null) {
      return true
    }
    return await this.holdLockKey(key, fileId)
  }

  /**
   * Renews the start lock while `fileId` owns it; a lapsed lock is taken again
   * when it is free. `false` only when another export holds it.
   */
  private async holdLockKey(key: string, fileId: string): Promise<boolean> {
    try {
      return (
        (await distributedStore.renewKeyIfOwner(
          key,
          fileId,
          LOCK_TTL_SECONDS,
        )) || (await distributedStore.claimKey(key, fileId, LOCK_TTL_SECONDS))
      )
    } catch (err) {
      logger.warn(
        { err, fileId },
        "channelPostExport: could not renew the start lock",
      )
      return true
    }
  }

  /**
   * Settles the export as uploaded, charges the owner's message quota once and
   * releases the start lock. `truncated`: a ceiling stopped the read.
   */
  async complete(input: {
    bytes: number
    fileId: string
    rowCount: number
    truncated: boolean
    workspaceId: string
  }): Promise<void> {
    const settled = await this.patchPendingFile(input, {
      fileSize: String(input.bytes),
      meta: { totalRecords: input.rowCount, truncated: input.truncated },
      status: fileStatuses.enum.uploaded,
      uploadedAt: new Date(),
    })
    if (!settled) {
      // Already settled by another run (or the file is gone): nothing to charge.
      return
    }
    // The file is finished: a charge that fails is logged, never turned into a
    // failure of the file (an under-count is acceptable, a second charge is not).
    try {
      await messageUsageService.charge({
        count: 1,
        workspaceId: input.workspaceId,
      })
    } catch (err) {
      logger.error(
        { err, fileId: input.fileId, workspaceId: input.workspaceId },
        "channelPostExport: could not charge the finished export",
      )
    }
    await this.releaseLock(settled, input.fileId, input.workspaceId)
  }

  /** Settles the export as failed with a reason code and releases the start lock. */
  async fail(input: {
    fileId: string
    reason: ExportFailureReason
    rowCount?: number
    workspaceId: string
  }): Promise<void> {
    const settled = await this.failFile(input)
    if (settled) {
      await this.releaseLock(settled, input.fileId, input.workspaceId)
    }
  }

  private async failFile(input: {
    fileId: string
    reason: ExportFailureReason
    rowCount?: number
    workspaceId: string
  }): Promise<ExportFile | null> {
    return await this.patchPendingFile(input, {
      meta: {
        failureReason: input.reason,
        ...(input.rowCount === undefined
          ? {}
          : { totalRecords: input.rowCount }),
      },
      status: fileStatuses.enum.failed,
    })
  }

  /**
   * Merges `values` into the file row (its `meta` field by field) only while
   * the row is still `pending`. Returns the row as it was, or `null` when it
   * was not pending (settled by another run) or is gone.
   */
  private async patchPendingFile(
    ids: { fileId: string; workspaceId: string },
    values: { meta?: FileMeta } & Omit<
      Parameters<typeof fileRepository.updateForWorkspace>[0]["values"],
      "meta"
    >,
  ): Promise<ExportFile | null> {
    const file = await fileRepository.findByIdForWorkspace({
      id: ids.fileId,
      workspaceId: ids.workspaceId,
    })
    if (!file) {
      return null
    }
    const updated = await fileRepository.updatePendingForWorkspace({
      id: ids.fileId,
      values: { ...values, meta: { ...file.meta, ...values.meta } },
      workspaceId: ids.workspaceId,
    })
    return updated ? file : null
  }

  private async releaseLock(
    file: ExportFile,
    fileId: string,
    workspaceId: string,
  ): Promise<void> {
    const key = lockKeyOfFile(file, workspaceId)
    if (key === null) {
      return
    }
    await distributedStore
      .releaseKeyIfOwner(key, fileId)
      .catch((err: unknown) => {
        // The TTL frees the lock anyway.
        logger.warn(
          { err, fileId },
          "channelPostExport: could not release the start lock",
        )
      })
  }

  /**
   * Takes the start lock for `fileId`, or answers with the export that holds
   * it once its file row exists. The holder may have settled between the two
   * reads, so a free lock is claimed once more before giving up; a holder
   * without a row yet (it is still creating it) is a conflict, and its lock is
   * never touched.
   */
  private async claimOrFindRunning(
    lockKey: string,
    fileId: string,
    workspaceId: string,
  ): Promise<StartedChannelPostCommentExport | null> {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (await distributedStore.claimKey(lockKey, fileId, LOCK_TTL_SECONDS)) {
        return null
      }
      const holderId = await distributedStore.getKeyOwner(lockKey)
      if (holderId) {
        const holder = await fileRepository.findByIdForWorkspace({
          id: holderId,
          workspaceId,
        })
        if (holder && isLive(holder)) {
          return { fileId: holderId, status: holder.status }
        }
        if (holder) {
          // Settled, or its job died: the lock is left over. Free it (only if
          // it is still the holder's) and claim again.
          await distributedStore.releaseKeyIfOwner(lockKey, holderId)
          continue
        }
        // The winner holds the lock but has not created its row yet: answering
        // with its id would succeed now and 404 on the first status read.
        break
      }
    }
    throw conflictException(
      "An export of these posts is starting. Try again in a moment.",
      "exportInProgress",
    )
  }

  /**
   * The workspace runs at most {@link CHANNEL_POST_EXPORT_MAX_RUNNING_PER_WORKSPACE}
   * channel exports: past it a start for another selection is refused. A start
   * for the selection already running answers with that file, as the lock does.
   * Races: two starts that arrive together can both pass, and the queue's
   * concurrency bounds what that lets through.
   */
  private async enforceRunningCap(
    lockKey: string,
    workspaceId: string,
  ): Promise<StartedChannelPostCommentExport | null> {
    const pending = await fileRepository.listPendingExportsForWorkspace({
      limit: CHANNEL_POST_EXPORT_RUNNING_SCAN_LIMIT,
      subType: exportSubTypes.enum.channelPostComments,
      workspaceId,
    })
    const running = pending.filter(isLive)
    if (running.length < CHANNEL_POST_EXPORT_MAX_RUNNING_PER_WORKSPACE) {
      return null
    }
    const same = running.find(
      (file) => lockKeyOfFile(file, workspaceId) === lockKey,
    )
    if (same) {
      return { fileId: same.id, status: same.status }
    }
    throw conflictException(
      "Another export of this workspace is running. Try again when it is done.",
      "exportInProgress",
    )
  }

  private async createAndEnqueue(input: {
    canViewEmailAndPhone: boolean
    expectedRecords: number | null
    fileId: string
    kind: ChannelPostCommentExportKind
    postIds: string[]
    userId: string | null
    workspaceId: string
  }): Promise<StartedChannelPostCommentExport> {
    const { fileId, kind, postIds, userId, workspaceId } = input
    const outputPath = `workspaces/${workspaceId}/exports/channel-posts/${kind}_${fileId}.csv`
    await fileRepository.create({
      contextType: fileContextTypes.enum.export,
      fileName: `post-${kind}-${new Date().toISOString().slice(0, 10)}.csv`,
      id: fileId,
      meta: {
        containsContactData: input.canViewEmailAndPhone,
        ...(input.expectedRecords === null
          ? {}
          : { expectedRecords: input.expectedRecords }),
        kind,
        sourceIds: postIds,
        totalRecords: 0,
      },
      mimeType: "text/csv",
      path: outputPath,
      status: fileStatuses.enum.pending,
      subType: exportSubTypes.enum.channelPostComments,
      userId,
      workspaceId,
    })
    // One attempt: a retry would read everything again; the user can start again.
    await channelPostExportQueue.add(
      ChannelPostExportJobAction.exportChannelPostComments,
      {
        data: {
          canViewEmailAndPhone: input.canViewEmailAndPhone,
          fileId,
          kind,
          outputPath,
          postIds,
          requestedUserId: userId ?? undefined,
          workspaceId,
        },
        type: ChannelPostExportJobAction.exportChannelPostComments,
      },
      {
        attempts: 1,
        jobId: exportChannelPostCommentsJobId(fileId),
        removeOnComplete: { age: 3600, count: 100 },
        removeOnFail: { age: 24 * 3600, count: 100 },
      },
    )
    return { fileId, status: fileStatuses.enum.pending }
  }
}

export const channelPostCommentExportService =
  new ChannelPostCommentExportService()
