import { createSearchParamsCache } from "nuqs/server"

export const getTeamsSearchParamsCache = createSearchParamsCache({})

export type GetTeamsSchema = Awaited<
  ReturnType<typeof getTeamsSearchParamsCache.parse>
> & { chatbotId: string }
