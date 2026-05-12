import {
  DefaultJobAction,
  type DefaultJobData,
  defaultQueue,
} from "@chatbotx.io/worker-config"
import { createBullMQWorker } from "../lib/create-worker"
import { loopableExportContacts } from "./handlers/export-contacts"
import { sendAuditLog } from "./handlers/send-audit-log"
import { sendErrorLog } from "./handlers/send-error-log"

await createBullMQWorker<DefaultJobData>({
  name: "default",
  label: "default",
  bootstrap: false,
  logJobReceipt: true,
  handlers: {
    [DefaultJobAction.sendAuditLog]: (data) => sendAuditLog(data),
    [DefaultJobAction.sendErrorLog]: (data) => sendErrorLog(data),
    [DefaultJobAction.exportContacts]: (data) => loopableExportContacts(data),
  },
  onFailed: async (job, err) => {
    if (!job || job.data.type === DefaultJobAction.sendErrorLog) {
      return
    }
    await defaultQueue.add(DefaultJobAction.sendErrorLog, {
      type: DefaultJobAction.sendErrorLog,
      data: {
        workspaceId: job.data.data.workspaceId,
        error: {
          message: err.message,
          stack: err.stack,
          httpCode: "500",
        },
      },
    })
  },
})
