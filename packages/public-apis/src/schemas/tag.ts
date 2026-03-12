import { z } from "zod"

export const tagSchema = z.object({
  id: z.string(),
  name: z.string(),
})
export type Tag = z.infer<typeof tagSchema>
