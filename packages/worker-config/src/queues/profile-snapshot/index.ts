import { Queue } from "bullmq"
import {
  defaultJobOptions,
  fakeQueue,
  getQueueConnection,
  isNoRedisEnv,
} from "../../lib/connection"
import { queueNames } from "../../lib/types"

export const ProfileSnapshotJobAction = {
  capture: "capture",
} as const

export type ProfileSnapshotJobData = {
  type: typeof ProfileSnapshotJobAction.capture
  data: {
    contactInboxId: string
    inboxId: string
    workspaceId: string
  }
}

export const profileSnapshotJobId = (contactInboxId: string): string =>
  `profile-snapshot-${contactInboxId}`

export const profileSnapshotQueue = isNoRedisEnv()
  ? fakeQueue
  : new Queue<ProfileSnapshotJobData>(queueNames.enum.profileSnapshot, {
      connection: getQueueConnection(queueNames.enum.profileSnapshot),
      defaultJobOptions,
    })
