import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

// Schema separado em arquivo próprio — quirk Next 16 standalone exige que
// `z.object()` em "use server" venha sempre importado, nunca inline.
// Ver memory: reference_next16_standalone_use_server_quirk.md
export const mergeContactsRequest = z.object({
  primaryId: zodBigintAsString(),
  duplicateIds: z.array(zodBigintAsString()).min(1).max(50),
})

export type MergeContactsRequest = z.infer<typeof mergeContactsRequest>
