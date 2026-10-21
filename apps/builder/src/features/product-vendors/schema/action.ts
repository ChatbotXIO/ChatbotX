import { z } from "zod"
import { productVendorFormRequest } from "./public"

/** Form inputs hand back `""` for an emptied box; the row stores null. */
const emptyToNull = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? null : value

export const productVendorFormSchema = productVendorFormRequest.extend({
  shortDescription: z.preprocess(
    emptyToNull,
    productVendorFormRequest.shape.shortDescription,
  ),
  phone: z.preprocess(emptyToNull, productVendorFormRequest.shape.phone),
  storeAddress: z.preprocess(
    emptyToNull,
    productVendorFormRequest.shape.storeAddress,
  ),
  imageUrl: z.preprocess(emptyToNull, productVendorFormRequest.shape.imageUrl),
  openHoursId: z.preprocess(
    emptyToNull,
    productVendorFormRequest.shape.openHoursId,
  ),
  categoryId: z.preprocess(
    emptyToNull,
    productVendorFormRequest.shape.categoryId,
  ),
  subcategoryId: z.preprocess(
    emptyToNull,
    productVendorFormRequest.shape.subcategoryId,
  ),
})
export type ProductVendorForm = z.input<typeof productVendorFormSchema>

/** The Active switch in the vendor list. */
export const productVendorActiveSchema = z.object({ isActive: z.boolean() })
