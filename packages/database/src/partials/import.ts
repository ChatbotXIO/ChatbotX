import { z } from "zod"
import { channelTypes } from "./channel"

export const importTypes = z.enum(["contacts", "coupons", "products"])
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

export const contactImportFields = z.enum([
  "contactId",
  "phoneNumber",
  "email",
  "firstName",
  "lastName",
])
export type ContactImportField = z.infer<typeof contactImportFields>

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
  timezone: z.string().trim().min(1).max(255).optional(),
  columnMap: contactImportColumnMapSchema,
  fieldMapping: contactImportFieldMappingSchema.optional(),
  tagId: bigintAsStringSchema.optional(),
})
export type ContactImportMeta = z.infer<typeof contactImportMetaSchema>

export const couponImportMetaSchema = z.object({
  topicId: bigintAsStringSchema,
})
export type CouponImportMeta = z.infer<typeof couponImportMetaSchema>

export const productImportFields = z.enum([
  "name",
  "sku",
  "price",
  "discount",
  "shortDescription",
  "category",
  "vendor",
  "inventoryQuantity",
  "imageUrl",
  "productUrl",
])
export type ProductImportField = z.infer<typeof productImportFields>

export const productImportColumnMapSchema = z.object({
  name: z.string().min(1),
  sku: z.string().optional(),
  price: z.string().optional(),
  discount: z.string().optional(),
  shortDescription: z.string().optional(),
  category: z.string().optional(),
  vendor: z.string().optional(),
  inventoryQuantity: z.string().optional(),
  imageUrl: z.string().optional(),
  productUrl: z.string().optional(),
})
export type ProductImportColumnMap = z.infer<
  typeof productImportColumnMapSchema
>

export const productImportMetaSchema = z.object({
  columnMap: productImportColumnMapSchema,
  createMissingCategories: z.boolean().default(true),
})
export type ProductImportMeta = z.infer<typeof productImportMetaSchema>

export const importMetaByType = {
  contacts: contactImportMetaSchema,
  coupons: couponImportMetaSchema,
  products: productImportMetaSchema,
} as const satisfies Record<ImportType, z.ZodTypeAny>
