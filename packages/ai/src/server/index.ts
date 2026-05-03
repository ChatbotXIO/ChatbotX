export * from "./cache"
export * from "./cache/ai-context-store"
export * from "./cache/schema"
export * from "./factory"
export * from "./knowledge-base"
export * from "./mcp-client"
export * from "./services/ai-context-service"
export * from "./services/summarizer"
export * from "./tools"
export * from "./toolset"

import { getCachedAIIntegration, invalidateAIIntegrationCache } from "./cache"
import { createAIModelInstance } from "./factory"

export const aiIntegrationService = {
  findBy: getCachedAIIntegration,
  createAIInstance: createAIModelInstance,
  invalidateCache: invalidateAIIntegrationCache,
}
