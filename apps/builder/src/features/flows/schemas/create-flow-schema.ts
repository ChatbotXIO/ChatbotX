import { z } from "zod"

export const createFlowSchema = z.object({
  folderId: z.string().nullable(),
  name: z.string().trim().min(1).max(255),
})
export type CreateFlowSchema = z.infer<typeof createFlowSchema>
