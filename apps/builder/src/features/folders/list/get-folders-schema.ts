import { createSearchParamsCache, parseAsString } from "nuqs/server"

export const getFoldersSearchParamsCache = createSearchParamsCache({
  chatbotId: parseAsString.withDefault(""),
  group: parseAsString.withDefault("")
})

export type GetFoldersSchema = Awaited<ReturnType<typeof getFoldersSearchParamsCache.parse>>
