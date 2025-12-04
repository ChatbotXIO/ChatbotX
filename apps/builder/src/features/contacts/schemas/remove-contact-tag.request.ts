import { z } from "zod"

export const removeContactTagRequest = z.object({
  ids: z.array(z.cuid2()),
  tags: z.array(z.string()),
})
export type RemoveContactTagRequest = z.infer<typeof removeContactTagRequest>
