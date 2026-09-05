import { createTanstackQueryUtils } from "@orpc/tanstack-query"
import { client } from "./orpc"

// Kept separate from `orpc.ts` so server-only importers of `client` don't
// pull in react-query.
export const orpc = createTanstackQueryUtils(client)
