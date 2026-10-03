import { sequenceConnections } from "@chatbotx.io/redis"
import { Queue } from "bullmq"
import { defaultJobOptions, isNoRedisEnv } from "../../lib/connection"
import { queueNames } from "../../lib/types"

export type SequenceSchedulerJobData = {
  dispatchId: string
  workspaceId: string
  claimedAt: number
  bucket: number
}

export type SequenceSchedulerQueue = Queue<SequenceSchedulerJobData>

let sequenceSchedulerQueueInstance: SequenceSchedulerQueue | null = null

export const getSequenceSchedulerQueue =
  async (): Promise<SequenceSchedulerQueue | null> => {
    if (isNoRedisEnv()) {
      return null
    }

    if (sequenceSchedulerQueueInstance) {
      return sequenceSchedulerQueueInstance
    }

    const connection = await sequenceConnections.useExisting()
    sequenceSchedulerQueueInstance = new Queue<SequenceSchedulerJobData>(
      queueNames.enum.sequenceScheduler,
      {
        connection,
        defaultJobOptions,
      },
    )

    return sequenceSchedulerQueueInstance
  }
