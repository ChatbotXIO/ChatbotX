import type { HeavyJobProcessAIFile } from "@chatbotx.io/worker-config"
import { processAIFile as processLegacyAIFile } from "../../ai-agent/handlers/process-ai-file"

export async function processAIFile(
  data: HeavyJobProcessAIFile["data"],
): Promise<void> {
  await processLegacyAIFile(data)
}
