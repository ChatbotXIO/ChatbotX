import { z } from "zod"

export const themeOptions = [
  "Amber",
  "Blue",
  "Cyan",
  "Emerald",
  "Fuchsia",
  "Green",
  "Indigo",
  "Lime",
  "Orange",
  "Pink",
  "Purple",
  "Red",
  "Rose",
  "Sky",
  "Stone",
  "Teal",
  "Violet",
  "Yellow",
] as const

export const updateOrganizationSchema = z.object({
  name: z.string().min(1),
  logo: z.object({
    url: z.union([z.url(), z.literal("")]),
    mode: z.enum(["file", "url"]).default("file"),
  }),
  theme: z.enum(themeOptions).nullable().default(null),
  customJS: z.string().nullable(),
  customCSS: z.string().nullable(),
})

export type UpdateOrganizationSchema = z.infer<typeof updateOrganizationSchema>
