import z from "zod"

export const OAProfile = z.object({
  oa_id: z.string(),
  name: z.string(),
  description: z.string(),
  avatar: z.string().url(),
})
export type zaloOAProfile = z.infer<typeof OAProfile>
