import { db } from "@chatbotx.io/database/client"
import { distributedStore, withCache } from "@chatbotx.io/redis"

const getAutomatedResponseCachedKey = (workspaceId: string) =>
  `workspaces:${workspaceId}:automated-responses:all`

export const automatedResponseService = {
  getCachedKey: getAutomatedResponseCachedKey,
  getAll: (workspaceId: string) =>
    withCache(
      getAutomatedResponseCachedKey(workspaceId),
      () =>
        db.query.automatedResponseModel.findMany({
          where: {
            workspaceId,
            status: true,
          },
          orderBy: {
            createdAt: "asc",
          },
        }),
      { ttl: 24 * 60 * 60 },
    ),
  invalidateCache: async (workspaceId: string) => {
    await distributedStore.delete(getAutomatedResponseCachedKey(workspaceId))
  },
}
