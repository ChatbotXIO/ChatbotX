import { createSearchParamsCache } from "nuqs/server"

export const getUsersSearchParamsCache = createSearchParamsCache({})

export type GetUsersSchema = Awaited<
  ReturnType<typeof getUsersSearchParamsCache.parse>
> & { chatbotId: string }
