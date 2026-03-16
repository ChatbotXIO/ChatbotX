import { z } from "zod"

export const createSequenceRequest = z.object({
  name: z.string().trim().min(1, "validation.required"),
  folderId: z.cuid2().nullable().optional(),
})

export type CreateSequenceRequest = z.infer<typeof createSequenceRequest>
