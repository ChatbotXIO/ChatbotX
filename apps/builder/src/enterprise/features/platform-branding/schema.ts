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

const logoField = z.object({
  url: z.union([z.url(), z.literal("")]),
  mode: z.enum(["file", "url"]).default("file"),
})

export const updatePlatformBrandingSchema = z.object({
  brandName: z.string().nullable(),
  logoLight: logoField,
  logoDark: logoField,
  favicon: logoField,
  theme: z.enum(themeOptions).nullable().default(null),
  customCss: z.string().nullable(),
  customJs: z.string().nullable(),
  policyUrl: z.string().nullable(),
  termsOfServiceUrl: z.string().nullable(),
})

export type UpdatePlatformBrandingSchema = z.infer<
  typeof updatePlatformBrandingSchema
>
