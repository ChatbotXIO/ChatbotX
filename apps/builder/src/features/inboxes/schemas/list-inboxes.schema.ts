import { createSearchParamsCache, parseAsInteger } from "nuqs/server"
import { z } from "zod"

export const listInboxesNuqs = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
})

const listInboxRequest = z.object({
  page: z.number().int().min(1).default(1).optional(),
  perPage: z.number().int().min(1).default(10).optional(),
  chatbotId: z.string().cuid2(),
  includes: z.array(z.literal("intergration")).optional(),
})
export type ListInboxesRequest = z.infer<typeof listInboxRequest>
