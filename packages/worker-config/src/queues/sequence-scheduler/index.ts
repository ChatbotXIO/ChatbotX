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

let sequenceSchedulerQueueInstance: Queue<SequenceSchedulerJobData> | null =
  null

export const getSequenceSchedulerQueue =
  async (): Promise<Queue<SequenceSchedulerJobData> | null> => {
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

export const SEQUENCE_SCHEDULER_QUEUE_NAME = queueNames.enum.sequenceScheduler
