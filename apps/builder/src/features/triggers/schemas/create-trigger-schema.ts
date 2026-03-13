import z from "zod"

export const createTriggerSchema = z.object({
  name: z.string().min(1, "Trigger name is required"),
  folderId: z.cuid2().nullable(),
})
export type CreateTriggerSchema = z.infer<typeof createTriggerSchema>
