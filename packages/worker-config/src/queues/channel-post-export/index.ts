import { Queue } from "bullmq"
import {
  defaultJobOptions,
  fakeQueue,
  getQueueConnection,
  isNoRedisEnv,
} from "../../lib/connection"
import { queueNames } from "../../lib/types"

/**
 * The "read from channel" comment exports of posts. Their own queue, consumed
 * with a small bounded concurrency: one export reads a channel page by page and
 * may sleep for minutes on the channel's usage hints and rate limits (up to its
 * 30 minute ceiling). On the shared `default` queue a few of them would hold
 * every slot and delay inbound webhooks, contact exports and imports.
 *
 * Rollout: a worker that predates this queue never consumes it, so a job added
 * by a new builder waits there until a new worker starts, instead of being
 * taken by an old `default` worker that does not know it and completed as a
 * no-op (the export would be lost).
 */
export const ChannelPostExportJobAction = {
  exportChannelPostComments: "exportChannelPostComments",
} as const

/** The kinds of a channel-post comment export read from the channel. */
export type ExportChannelPostCommentsKind = "comments" | "phones" | "emails"

/** Deterministic: the one job of an export file (a re-add of it is a no-op). */
export const exportChannelPostCommentsJobId = (fileId: string) =>
  `export-channel-post-comments-${fileId}`

export type JobExportChannelPostComments = {
  type: typeof ChannelPostExportJobAction.exportChannelPostComments
  data: {
    workspaceId: string
    requestedUserId?: string
    fileId: string
    kind: ExportChannelPostCommentsKind
    /** `ChannelPost.id`s, in the order they are read. */
    postIds: string[]
    /** Whether the requester may see phone numbers and emails; masks the text without it. */
    canViewEmailAndPhone: boolean
    outputPath: string
  }
}

export type ChannelPostExportJobData = JobExportChannelPostComments

export const channelPostExportQueue = isNoRedisEnv()
  ? fakeQueue
  : new Queue<ChannelPostExportJobData>(queueNames.enum.channelPostExport, {
      connection: getQueueConnection(queueNames.enum.channelPostExport),
      defaultJobOptions,
    })
