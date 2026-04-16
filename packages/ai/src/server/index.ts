export * from "./cache"
export * from "./factory"
export * from "./knowledge-base"
export * from "./mcp-client"
export * from "./tools"
export * from "./toolset"

import { getCachedAIIntegration, invalidateAIIntegrationCache } from "./cache"
import { createAIModelInstance } from "./factory"

export const aiIntegrationService = {
  findBy: getCachedAIIntegration,
  createAIInstance: createAIModelInstance,
  invalidateCache: invalidateAIIntegrationCache,
}
