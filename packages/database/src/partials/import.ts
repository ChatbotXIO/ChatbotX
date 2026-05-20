import { z } from "zod"
import { channelTypes } from "./channel"

export const importTypes = z.enum(["contacts"])
export type ImportType = z.infer<typeof importTypes>

export const importFormats = z.enum(["csv", "xlsx", "xls"])
export type ImportFormat = z.infer<typeof importFormats>

export const importStatuses = z.enum([
  "pending",
  "processing",
  "completed",
  "failed",
])
export type ImportStatus = z.infer<typeof importStatuses>

const bigintAsStringSchema = z.string().regex(/^\d+$/)

export const contactImportColumnMapSchema = z
  .object({
    contactId: z.string().optional(),
    phoneNumber: z.string().optional(),
    email: z.string().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
  })
  .strip()
export type ContactImportColumnMap = z.infer<
  typeof contactImportColumnMapSchema
>

export const contactImportFieldMappingSchema = z.array(
  z.object({
    column: z.string(),
    customFieldId: bigintAsStringSchema,
  }),
)
export type ContactImportFieldMapping = z.infer<
  typeof contactImportFieldMappingSchema
>

export const countryCodeSchema = z
  .string()
  .regex(/^\+\d{1,4}$/, "Country code must be in E.164 format (e.g. +1, +84)")

export const contactImportMetaSchema = z.object({
  channel: channelTypes,
  countryCode: countryCodeSchema.optional(),
  columnMap: contactImportColumnMapSchema,
  fieldMapping: contactImportFieldMappingSchema.optional(),
  tagId: bigintAsStringSchema.optional(),
})
export type ContactImportMeta = z.infer<typeof contactImportMetaSchema>

export const importMetaByType = {
  contacts: contactImportMetaSchema,
} as const satisfies Record<ImportType, z.ZodTypeAny>
