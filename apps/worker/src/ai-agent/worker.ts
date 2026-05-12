import { AIJobAction, type AIJobData } from "@chatbotx.io/worker-config"
import { createBullMQWorker } from "../lib/create-worker"
import { processAIFile } from "./handlers/process-ai-file"
import { processPendingEmbedding } from "./handlers/process-pending-embeddings"

await createBullMQWorker<AIJobData>({
  name: "aiAgent",
  label: "AI Agent",
  logJobReceipt: true,
  handlers: {
    [AIJobAction.processAIFile]: (data) => processAIFile(data),
    [AIJobAction.processPendingEmbedding]: (data) =>
      processPendingEmbedding(data),
  },
})
