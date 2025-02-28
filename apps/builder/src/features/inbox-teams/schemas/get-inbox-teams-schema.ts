import { createSearchParamsCache } from "nuqs/server"

export const getInboxTeamsSearchParamsCache = createSearchParamsCache({})

export type GetInboxTeamsSchema = Awaited<
  ReturnType<typeof getInboxTeamsSearchParamsCache.parse>
> & { chatbotId: string }
