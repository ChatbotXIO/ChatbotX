import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

// Schema separado por causa do Next 16 standalone "use server" quirk
// (schemas Zod não podem ficar em files marcados "use server").
export const unmergeContactsRequest = z.object({
  primaryId: zodBigintAsString(),
  duplicateIds: z.array(zodBigintAsString()).min(1).max(50),
})
export type UnmergeContactsRequest = z.infer<typeof unmergeContactsRequest>
