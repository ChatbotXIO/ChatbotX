import { z } from "zod"

export const removeContactTagRequest = z.object({
  ids: z.array(z.string().cuid2()),
  tagId: z.string().cuid2(),
})
export type RemoveContactTagRequest = z.infer<typeof removeContactTagRequest>
