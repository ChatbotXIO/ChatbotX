import z from "zod"

export const selectPageRequest = z.object({
  pageId: z.string(),
  pageName: z.string(),
  accessToken: z.string(),
})
export type SelectPageRequest = z.infer<typeof selectPageRequest>

export const validateOrganizationSettingSchema = z.object({
  messengerClientId: z.string(),
  messengerClientSecret: z.string(),
  messengerVersion: z.string(),
  messengerVerifyToken: z.string(),
})
export type ValidateOrganizationSetting = z.infer<
  typeof validateOrganizationSettingSchema
>
