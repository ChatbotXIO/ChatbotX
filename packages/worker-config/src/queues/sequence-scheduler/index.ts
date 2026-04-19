import { sequenceConnections } from "@chatbotx.io/redis"
import { Queue } from "bullmq"
import { defaultJobOptions } from "../../lib/connection"
import { queueName } from "../../lib/types"

export type SequenceSchedulerJobData = {
  dispatchId: string
  claimedAt: number
  bucket: number
}

let sequenceSchedulerQueueInstance: Queue<SequenceSchedulerJobData> | null =
  null

export const getSequenceSchedulerQueue =
  async (): Promise<Queue<SequenceSchedulerJobData> | null> => {
    if (process.env.NEXT_PHASE === "phase-production-build") {
      return null
    }

    if (sequenceSchedulerQueueInstance) {
      return sequenceSchedulerQueueInstance
    }

    const connection = await sequenceConnections.useExisting()
    sequenceSchedulerQueueInstance = new Queue<SequenceSchedulerJobData>(
      queueName.sequenceScheduler,
      {
        connection,
        defaultJobOptions,
      },
    )

    return sequenceSchedulerQueueInstance
  }

export const SEQUENCE_SCHEDULER_QUEUE_NAME = queueName.sequenceScheduler
