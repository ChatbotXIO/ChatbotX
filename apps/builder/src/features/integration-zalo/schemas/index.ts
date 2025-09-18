import z from "zod"

export const validateOrganizationSettingSchema = z.object({
  zalo: z.object({
    clientId: z.string().min(1),
    clientSecret: z.string().min(1),
    version: z.string().min(1),
    verifyToken: z.string().min(1),
  }),
})

export const OAProfile = z.object({
  oa_id: z.string(),
  name: z.string(),
  description: z.string(),
  avatar: z.string().url(),
})
export type zaloOAProfile = z.infer<typeof OAProfile>
