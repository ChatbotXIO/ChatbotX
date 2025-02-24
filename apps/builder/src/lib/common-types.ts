import { z } from "zod"

export const idBindParams = z.tuple([z.string().cuid2()])
export type IdBindParams = z.infer<typeof idBindParams>

export const deleteRecordsSchema = z.object({
  chatbotId: z.string().cuid2(),
  ids: z.array(z.string().cuid2()),
})
export type DeleteRecordsSchema = z.infer<typeof deleteRecordsSchema>
