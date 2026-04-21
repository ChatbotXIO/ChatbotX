import { BroadcastJobAction, broadcastQueue } from "@chatbotx.io/worker-config"
import { Queue } from "bullmq"

export const registerBroadcastSchedules = async () => {
  if (!(broadcastQueue instanceof Queue)) {
    return
  }

  await broadcastQueue.upsertJobScheduler(
    BroadcastJobAction.processBroadcastContacts,
    {
      pattern: "* * * * *",
    },
    {
      name: BroadcastJobAction.processBroadcastContacts,
      data: {
        type: BroadcastJobAction.processBroadcastContacts,
        data: {},
      },
    },
  )
}
