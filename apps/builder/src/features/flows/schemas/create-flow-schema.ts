import { z } from "zod"

export const createFlowSchema = z.object({
  folderId: z.string().nullable(),
  name: z.string().min(1).max(255).trim(),
})
export type CreateFlowSchema = z.infer<typeof createFlowSchema>
