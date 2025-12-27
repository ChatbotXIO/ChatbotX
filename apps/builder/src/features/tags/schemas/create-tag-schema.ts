import { z } from "zod"

export const createTagSchema = z.object({
  name: z.string().trim().min(1).max(255),
  folderId: z.cuid2().nullable(),
  syncToMessenger: z.boolean(),
})
export type CreateTagSchema = z.input<typeof createTagSchema>
