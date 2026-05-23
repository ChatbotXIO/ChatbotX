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
  brandName: z.string().trim().min(1).nullable(),
  logoLight: logoField,
  logoDark: logoField,
  favicon: logoField,
  theme: z.enum(themeOptions).nullable().default(null),
  customCss: z.string().max(50_000).nullable(),
  customJs: z.string().max(50_000).nullable(),
  policyUrl: z.union([z.url(), z.literal(""), z.null()]),
  termsOfServiceUrl: z.union([z.url(), z.literal(""), z.null()]),
})

export type UpdatePlatformBrandingSchema = z.infer<
  typeof updatePlatformBrandingSchema
>
