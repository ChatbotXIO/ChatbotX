import { z } from "zod"

export const listSpreadsheetsRequest = z.object({
  chatbotId: z.cuid2(),
  page: z.number().optional(),
  perPage: z.number().optional(),
  name: z.string().optional(),
})

export type ListSpreadsheetsRequest = z.infer<typeof listSpreadsheetsRequest>
