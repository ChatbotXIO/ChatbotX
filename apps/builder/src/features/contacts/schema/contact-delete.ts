import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

// Deliberately narrower than the shared bulkUpdateIdsRequest: contact deletion
// fans out into tombstone bookkeeping per chunk, so the request size is capped
// at 100 ids (the contacts table UI selects at most 50 rows per page; the cap
// leaves headroom for direct callers without allowing unbounded batches).
export const deleteContactRequest = z.object({
  ids: z.array(zodBigintAsString()).min(1).max(100),
})
export type DeleteContactRequest = z.infer<typeof deleteContactRequest>
