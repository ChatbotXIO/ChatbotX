import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const publicProductVendorWriteResource = z.object({
  id: z.string(),
  name: z.string(),
  shortDescription: z.string().nullable(),
  phone: z.string().nullable(),
  storeAddress: z.string().nullable(),
  imageUrl: z.string().nullable(),
  isActive: z.boolean(),
  discountPercent: z.number(),
  minimumOrderValue: z.number(),
  openHoursId: z.string().nullable(),
  categoryId: z.string().nullable(),
  subcategoryId: z.string().nullable(),
  rank: z.number(),
})
export type ProductVendorResource = z.infer<
  typeof publicProductVendorWriteResource
>

export const publicProductVendorResource =
  publicProductVendorWriteResource.extend({
    productCount: z.number().describe("Products sold by this vendor."),
  })

export const listProductVendorsPublicRequest = z.object({
  name: z
    .string()
    .trim()
    .max(255)
    .optional()
    .describe("Only vendors whose name contains this, ignoring case."),
  page: z.coerce.number().int().min(1).optional().describe("Page, from 1."),
  perPage: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Vendors per page, up to 100. Omit both for every vendor."),
})

export const listProductVendorsPublicResponse = z.object({
  data: z.array(publicProductVendorResource),
  pageCount: z.number(),
})

const ID_PATTERN = /^\d+$/

const idSchema = (description: string) =>
  z.string().regex(ID_PATTERN).nullish().describe(description)

export const productVendorFormRequest = z.object({
  name: z.string().trim().min(1).max(255).describe("Vendor or brand name."),
  shortDescription: z
    .string()
    .trim()
    .max(500)
    .nullish()
    .describe("Short description of the vendor."),
  phone: z.string().trim().max(64).nullish().describe("Vendor phone number."),
  storeAddress: z
    .string()
    .trim()
    .max(1000)
    .nullish()
    .describe("Vendor store address."),
  imageUrl: z
    .string()
    .trim()
    .url()
    .max(2048)
    .nullish()
    .describe("Vendor image URL."),
  isActive: z
    .boolean()
    .optional()
    .describe("Off hides the vendor's products and refuses their orders."),
  discountPercent: z
    .number()
    .min(0)
    .max(100)
    .optional()
    .describe(
      "0–100, taken off every product of the vendor on top of its own.",
    ),
  minimumOrderValue: z
    .number()
    .min(0)
    .optional()
    .describe("Smallest total of this vendor's items an order may carry."),
  openHoursId: idSchema(
    "Open-hours schedule; null is always open. Get it from `openHours.list`.",
  ),
  categoryId: idSchema("Category id. Get it from `productCategories.list`."),
  subcategoryId: idSchema("Sub-category id, a child of `categoryId`."),
  rank: z
    .number()
    .int()
    .optional()
    .describe("Sort order among vendors; lower comes first."),
})

export const createProductVendorPublicRequest = productVendorFormRequest

export const updateProductVendorPublicRequest = productVendorFormRequest
  .partial()
  .extend({
    id: zodBigintAsString().describe(
      "Vendor id. Get it from `productVendors.list`.",
    ),
  })
