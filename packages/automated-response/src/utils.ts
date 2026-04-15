import { db } from "@chatbotx.io/database/client"
import { distributedStore, withCache } from "@chatbotx.io/redis"

export const getAutomatedResponseCachedKey = (workspaceId: string) => {
  return `workspaces:${workspaceId}:automated-responses:all`
}

export const getAllWorkspaceAutomatedResponses = (workspaceId: string) => {
  return withCache(getAutomatedResponseCachedKey(workspaceId), () => {
    return db.query.automatedResponseModel.findMany({
      where: {
        workspaceId,
        status: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    })
  })
}

export const invalidateAutomatedResponsesCache = async (
  workspaceId: string,
) => {
  await distributedStore.delete(getAutomatedResponseCachedKey(workspaceId))
}
