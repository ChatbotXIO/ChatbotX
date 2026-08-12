import { createSearchParamsCache } from "nuqs/server"
import { accountSearchParam } from "./account"

export const connectAccountsSearchParamsCache = createSearchParamsCache({
  account: accountSearchParam,
})
