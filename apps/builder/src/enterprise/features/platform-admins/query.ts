import { createSearchParamsCache, parseAsInteger } from "nuqs/server"

export const getPlatformAdminsSearchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
})
