export * from "./cache"
export * from "./factory"
export * from "./mcp-client"
export * from "./tools"
export * from "./toolset"

import { getCachedAIIntegration, invalidateAIIntegrationCache } from "./cache"
import { getAIIntegrationInDB } from "./factory"

export const aiIntegrationService = {
  getInDB: getAIIntegrationInDB,
  getCached: getCachedAIIntegration,
  invalidateCache: invalidateAIIntegrationCache,
}
