import z from "zod"

export const selectPageRequest = z.object({
  pageId: z.string(),
  pageName: z.string(),
  accessToken: z.string(),
})
export type SelectPageRequest = z.infer<typeof selectPageRequest>

export const validateOrganizationSettingSchema = z.object({
  messenger: z.object({
    clientId: z.string().min(1),
    clientSecret: z.string().min(1),
    version: z.string().min(1),
    verifyToken: z.string().min(1),
  }),
})
export type ValidateOrganizationSetting = z.infer<
  typeof validateOrganizationSettingSchema
>
