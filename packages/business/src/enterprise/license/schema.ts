import { z } from "zod"

export const LICENSE_FEATURES = [
  "sso",
  "customBranding",
  "customDomain",
  "auditLog",
  "prioritySupport",
] as const

export const licenseFeatureSchema = z.enum(LICENSE_FEATURES)

export const licenseLimitsSchema = z.object({
  maxWorkspaces: z.number().int().positive().nullable(),
  maxSeats: z.number().int().positive().nullable(),
  maxChannels: z.number().int().positive().nullable(),
})

export const licensePayloadSchema = z.object({
  sub: z.string().min(1),
  iss: z.string().min(1),
  iat: z.number().int().positive(),
  exp: z.number().int().positive(),
  nbf: z.number().int().positive().optional(),
  customerName: z.string().min(1),
  tier: z.enum(["enterprise", "enterprise-plus"]),
  features: z.array(licenseFeatureSchema),
  limits: licenseLimitsSchema,
  licenseId: z.string().min(1),
})

export type LicenseFeature = z.infer<typeof licenseFeatureSchema>
export type LicenseLimits = z.infer<typeof licenseLimitsSchema>
export type LicensePayload = z.infer<typeof licensePayloadSchema>
export type LicenseLimitKey = keyof LicenseLimits
