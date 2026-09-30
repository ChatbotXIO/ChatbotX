import { Queue } from "bullmq"
import {
  defaultJobOptions,
  fakeQueue,
  getQueueConnection,
  isNoRedisEnv,
} from "../../lib/connection"
import { queueNames } from "../../lib/types"

export const InstagramSnapshotJobAction = {
  capture: "capture",
} as const

export type InstagramSnapshotJobData = {
  type: typeof InstagramSnapshotJobAction.capture
  data: {
    contactInboxId: string
    inboxId: string
    workspaceId: string
  }
}

export const instagramSnapshotJobId = (contactInboxId: string): string =>
  `ig-snapshot-${contactInboxId}`

export const instagramSnapshotQueue = isNoRedisEnv()
  ? fakeQueue
  : new Queue<InstagramSnapshotJobData>(queueNames.enum.instagramSnapshot, {
      connection: getQueueConnection(queueNames.enum.instagramSnapshot),
      defaultJobOptions,
    })
