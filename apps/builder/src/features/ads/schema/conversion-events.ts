import { createSearchParamsCache } from "nuqs/server"
import { accountSearchParam } from "./account"

export const conversionEventsSearchParamsCache = createSearchParamsCache({
  account: accountSearchParam,
})
