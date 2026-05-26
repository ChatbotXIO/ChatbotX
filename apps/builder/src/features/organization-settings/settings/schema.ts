import { z } from "zod"

export const updateOrganizationSchema = z.object({
  name: z.string().min(1),
  logo: z.object({
    url: z.union([z.url(), z.literal("")]),
    mode: z.enum(["file", "url"]).default("file"),
  }),
})

export type UpdateOrganizationSchema = z.infer<typeof updateOrganizationSchema>
