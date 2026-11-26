import {
  CHANNEL_POST_EXPORT_KINDS,
  CHANNEL_POST_EXPORT_MAX_DURATION_MS,
  CHANNEL_POST_EXPORT_MAX_PAGES_PER_POST,
  CHANNEL_POST_EXPORT_PROGRESS_INTERVAL_MS,
  CHANNEL_ROW_BUILDERS,
  type ChannelPostExportTarget,
  channelPostCommentExportService,
  type ExportRow,
} from "@chatbotx.io/business"
import { createUpload } from "@chatbotx.io/filesystem/node-upload"
import { toUploadWriter } from "@chatbotx.io/filesystem/upload-writer"
import {
  isPostManagementChannel,
  type PostManagementChannel,
} from "@chatbotx.io/utils/channel"
import { toCsvRow, UTF8_BOM } from "@chatbotx.io/utils/csv"
import type { JobExportChannelPostComments } from "@chatbotx.io/worker-config"
import { resolvePostIntegration } from "../../channel-post-sync/resolve-post-integration"
import { isBlockedWorkspace } from "../../lib/is-blocked-workspace"
import { logger } from "../../lib/logger"
import {
  ChannelPostExportFailure,
  classifyExportFailure,
  readWithRateLimitRetry,
} from "./channel-post-export-errors"
import { type RowSink, SINK_FACTORIES } from "./channel-post-export-sink"

type ExportData = JobExportChannelPostComments["data"]

/** What the read of all posts shares: the clock, the sink and the progress saved so far. */
type ReadRun = {
  data: ExportData
  /** Epoch ms of the export's wall-time ceiling. */
  deadlineAt: number
  isOverTime: () => boolean
  /** Wall time left before the export's ceiling. */
  remainingMs: () => number
  /** The channel's usage hint carried to the next read, across posts. */
  pacing: { pauseMs: number | null }
  saveProgress: () => Promise<void>
  sink: RowSink
}

/**
 * Waits out the pause the channel's usage headers asked for before the next
 * read. `false` when the pause would outlast the export's wall-time ceiling:
 * the export ends there as truncated instead of waiting past its deadline.
 */
const waitForPacing = async (run: ReadRun): Promise<boolean> => {
  const { pauseMs } = run.pacing
  run.pacing.pauseMs = null
  if (!pauseMs || pauseMs <= 0) {
    return true
  }
  if (pauseMs >= run.remainingMs()) {
    return false
  }
  logger.warn(
    { fileId: run.data.fileId, pauseMs },
    "channelPostExport: the channel's usage budget is spent, pausing before the next read",
  )
  await new Promise<void>((resolve) => setTimeout(resolve, pauseMs))
  return true
}

/**
 * Reads the pages of one post into the sink. Returns `false` when the whole
 * export must stop (a ceiling was hit); the per-post page ceiling only ends
 * this post and flags the file `truncated` through the returned flag.
 */
const readPost = async (
  target: ChannelPostExportTarget,
  run: ReadRun,
  markTruncated: () => void,
  hasMoreTargets: boolean,
): Promise<boolean> => {
  const { channel, ctx, integration } = await resolvePostIntegration({
    channel: target.channel,
    inboxId: target.inboxId,
    workspaceId: run.data.workspaceId,
  })
  if (!integration.hasChannelHandler("post", "listComments")) {
    throw new ChannelPostExportFailure("notSupported")
  }
  const buildRow = CHANNEL_ROW_BUILDERS[run.data.kind]
  const rowContext = {
    canViewEmailAndPhone: run.data.canViewEmailAndPhone,
    postLabel: target.label,
  }

  let cursor: string | undefined
  let pages = 0
  do {
    if (!(await waitForPacing(run)) || run.isOverTime()) {
      markTruncated()
      return false
    }
    if (pages >= CHANNEL_POST_EXPORT_MAX_PAGES_PER_POST) {
      markTruncated()
      return true
    }
    const read = await readWithRateLimitRetry(
      channel,
      () =>
        integration.runChannelHandler("post", "listComments", {
          ctx,
          data: { cursor, postId: target.externalPostId },
        }),
      run.deadlineAt,
    )
    if (read.status === "deadline") {
      // The ceiling came while waiting out a limit: finish with the rows read.
      markTruncated()
      return false
    }
    const page = read.value
    pages += 1
    run.pacing.pauseMs = page.pauseMs ?? null
    const entries = page.items.flatMap((comment): ExportRow[] => {
      const entry = buildRow(comment, rowContext)
      return entry ? [entry] : []
    })
    const wantsMore = await run.sink.accept(
      entries,
      page.nextCursor !== null || hasMoreTargets,
    )
    await run.saveProgress()
    if (!wantsMore) {
      return false
    }
    cursor = page.nextCursor ?? undefined
  } while (cursor)
  return true
}

/** The export's row still exists and waits for this run, and its workspace is not blocked. */
const isStillWanted = async (ids: {
  fileId: string
  workspaceId: string
}): Promise<boolean> =>
  (await channelPostCommentExportService.isPending(ids)) &&
  !(await isBlockedWorkspace(ids.workspaceId))

/**
 * A blocked owner never reads the channel: the file is settled as failed so
 * the user sees it and the start lock is freed.
 */
export const failBlockedChannelPostExport = (data: ExportData): Promise<void> =>
  channelPostCommentExportService.fail({
    fileId: data.fileId,
    reason: "failed",
    workspaceId: data.workspaceId,
  })

/** The posts' channels, to classify an error that carries no channel of its own. */
const channelOf = (
  targets: ChannelPostExportTarget[],
  failedAt: number,
): PostManagementChannel | null => {
  const channel = targets[failedAt]?.channel
  return isPostManagementChannel(channel) ? channel : null
}

/**
 * Aborts the partly written object. An abort that fails is logged and goes no
 * further: the file must still be settled and its lock released after it.
 */
const abortQuietly = async (
  upload: { abort: () => Promise<void> },
  fileId: string,
): Promise<void> => {
  try {
    await upload.abort()
  } catch (err) {
    logger.warn(
      { err, fileId },
      "channelPostExport: could not abort the upload",
    )
  }
}

/**
 * Background export of the comments of posts, read from the channel itself
 * (the "Read from channel" download). The posts are read one after another,
 * page by page, so memory stays at one page (`comments`) or at the distinct
 * values kept (`phones`, `emails`). A ceiling ends the file as uploaded and
 * `truncated`; any error ends it as `failed` with a reason code, and the
 * partly written object is aborted so no part is left behind.
 */
export const exportChannelPostComments = async (
  data: ExportData,
): Promise<void> => {
  const { fileId, kind, workspaceId } = data
  const ids = { fileId, workspaceId }
  // Not pending any more (a job that runs again must not read everything
  // twice) or never picked up within the maximum queue wait (failed there):
  // nothing to read. The
  // wall-time ceiling counts from this pickup, not from the file's creation (the
  // job may have waited in the queue); the heartbeat tells a status reader the
  // job is alive.
  if (!(await channelPostCommentExportService.beginRun(ids))) {
    return
  }
  const startedAt = Date.now()
  const upload = toUploadWriter(
    createUpload(data.outputPath, { contentType: "text/csv; charset=utf-8" }),
  )
  const sink = SINK_FACTORIES[kind](upload)
  let progressSavedAt = startedAt
  let truncated = false
  let targets: ChannelPostExportTarget[] = []
  let failedAt = 0

  const deadlineAt = startedAt + CHANNEL_POST_EXPORT_MAX_DURATION_MS
  const remainingMs = () => deadlineAt - Date.now()

  const run: ReadRun = {
    data,
    deadlineAt,
    isOverTime: () => remainingMs() <= 0,
    pacing: { pauseMs: null },
    remainingMs,
    saveProgress: async () => {
      if (
        Date.now() - progressSavedAt <
        CHANNEL_POST_EXPORT_PROGRESS_INTERVAL_MS
      ) {
        return
      }
      progressSavedAt = Date.now()
      const ownsLock = await channelPostCommentExportService.recordProgress({
        ...ids,
        canViewEmailAndPhone: data.canViewEmailAndPhone,
        kind,
        postIds: data.postIds,
        rowCount: sink.rowCount(),
      })
      if (!ownsLock) {
        // Another export of the same posts holds the lock now: stop, so the
        // file is failed and never uploaded or charged next to the other one.
        throw new ChannelPostExportFailure("failed")
      }
    },
    sink,
  }

  try {
    targets = await channelPostCommentExportService.resolveTargets({
      postIds: data.postIds,
      workspaceId,
    })
    if (targets.length !== data.postIds.length) {
      throw new ChannelPostExportFailure("postNotFound")
    }
    await upload.write(
      `${UTF8_BOM}${toCsvRow(CHANNEL_POST_EXPORT_KINDS[kind].header)}`,
    )
    for (failedAt = 0; failedAt < targets.length; failedAt++) {
      const target = targets[failedAt]
      if (!target) {
        continue
      }
      const keepGoing = await readPost(
        target,
        run,
        () => {
          truncated = true
        },
        failedAt < targets.length - 1,
      )
      if (!keepGoing) {
        break
      }
    }
    await sink.finish()
    if (!(await isStillWanted(ids))) {
      // The file was purged, settled elsewhere or its owner blocked while this
      // ran: finishing would store an object nothing points at.
      await abortQuietly(upload, fileId)
      // A no-op when the row is gone or already settled; frees a blocked owner's file.
      await failBlockedChannelPostExport(data)
      return
    }
    await upload.finish()
    await channelPostCommentExportService.complete({
      ...ids,
      bytes: upload.bytesWritten(),
      rowCount: sink.rowCount(),
      truncated: truncated || sink.truncated(),
    })
  } catch (error) {
    await abortQuietly(upload, fileId)
    const reason = classifyExportFailure(channelOf(targets, failedAt), error)
    logger.warn(
      { err: error, fileId, reason, workspaceId },
      "channelPostExport: the export failed",
    )
    await channelPostCommentExportService.fail({
      ...ids,
      reason,
      rowCount: sink.rowCount(),
    })
  }
}
