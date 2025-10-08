import { z } from "zod"

export const removeContactTagRequest = z.object({
  ids: z.array(z.cuid2()),
  tagId: z.cuid2(),
})
export type RemoveContactTagRequest = z.infer<typeof removeContactTagRequest>
