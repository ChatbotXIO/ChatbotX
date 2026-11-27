import { z } from "zod"

/**
 * WooCommerce sends money and quantities as strings (`"19.90"`), an unset
 * price as `""`. Read as a number, 0 when blank, missing or not a number.
 */
const numeric = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((value) => {
    if (value === null || value === undefined || value === "") {
      return 0
    }
    const parsed = typeof value === "number" ? value : Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : 0
  })

/** A number WooCommerce may leave out or send as null. */
const optionalNumber = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((value) => {
    if (value === null || value === undefined || value === "") {
      return null
    }
    const parsed = typeof value === "number" ? value : Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : null
  })

const text = z
  .string()
  .nullish()
  .transform((value) => value ?? "")

const nullableText = z
  .string()
  .nullish()
  .transform((value) => (value ? value : null))

const termSchema = z.object({
  id: z.number(),
  name: text,
  slug: text,
})

const imageSchema = z.object({ src: z.string() })

const metaSchema = z.object({
  key: z.string(),
  value: z.unknown(),
})

export const wooCommerceProductSchema = z.object({
  id: z.number(),
  name: text,
  slug: text,
  permalink: text,
  /** `simple`, `variable`, `grouped` or `external`. */
  type: text,
  /** `publish`, `draft`, `pending`, `private` or `future`. */
  status: text,
  /** `visible`, `catalog`, `search` or `hidden`. */
  catalog_visibility: text,
  description: text,
  short_description: text,
  sku: text,
  price: numeric,
  regular_price: numeric,
  manage_stock: z.union([z.boolean(), z.literal("parent")]).optional(),
  stock_quantity: optionalNumber,
  /** `instock`, `outofstock` or `onbackorder`. */
  stock_status: text,
  backorders: text,
  categories: z.array(termSchema).default([]),
  tags: z.array(termSchema).default([]),
  /** WooCommerce 9.6+ ships product brands; older stores leave it out. */
  brands: z.array(termSchema).optional().default([]),
  images: z.array(imageSchema).default([]),
  attributes: z
    .array(
      z.object({
        id: z.number(),
        name: text,
        position: z.number().optional().default(0),
        variation: z.boolean().optional().default(false),
        options: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  variations: z.array(z.number()).default([]),
  /** Set when the id read was a variation: the variable product it belongs to. */
  parent_id: z.number().optional().default(0),
})
export type WooCommerceProduct = z.infer<typeof wooCommerceProductSchema>

export const wooCommerceVariationSchema = z.object({
  id: z.number(),
  sku: text,
  price: numeric,
  /** `publish` is sold; `private` is turned off in the store. */
  status: text,
  manage_stock: z.union([z.boolean(), z.literal("parent")]).optional(),
  stock_quantity: optionalNumber,
  stock_status: text,
  image: imageSchema.nullish(),
  attributes: z
    .array(z.object({ id: z.number(), name: text, option: text }))
    .default([]),
})
export type WooCommerceVariation = z.infer<typeof wooCommerceVariationSchema>

export const wooCommerceCouponSchema = z.object({
  id: z.number(),
  code: text,
  amount: numeric,
  /** `percent`, `fixed_cart` or `fixed_product`. */
  discount_type: text,
  /** `publish` when the coupon is live. */
  status: text.optional().default("publish"),
  date_created_gmt: nullableText,
  date_expires_gmt: nullableText,
  usage_count: optionalNumber,
  usage_limit: optionalNumber,
  usage_limit_per_user: optionalNumber,
  free_shipping: z.boolean().optional().default(false),
  product_ids: z.array(z.number()).default([]),
  excluded_product_ids: z.array(z.number()).default([]),
  product_categories: z.array(z.number()).default([]),
  excluded_product_categories: z.array(z.number()).default([]),
  email_restrictions: z.array(z.string()).default([]),
  minimum_amount: numeric,
  maximum_amount: numeric,
  exclude_sale_items: z.boolean().optional().default(false),
})
export type WooCommerceCoupon = z.infer<typeof wooCommerceCouponSchema>

const addressSchema = z.object({
  first_name: text,
  last_name: text,
  company: text,
  address_1: text,
  address_2: text,
  city: text,
  state: text,
  postcode: text,
  country: text,
  email: text.optional().default(""),
  phone: text.optional().default(""),
})
export type WooCommerceAddress = z.infer<typeof addressSchema>

export const wooCommerceOrderSchema = z.object({
  id: z.number(),
  /** What the merchant sees, usually the id; plugins may change it. */
  number: text,
  /**
   * `pending`, `processing`, `on-hold`, `completed`, `cancelled`,
   * `refunded`, `failed`, `trash` or `checkout-draft`; plugins add more.
   */
  status: text,
  currency: text,
  date_created_gmt: nullableText,
  date_paid_gmt: nullableText,
  date_completed_gmt: nullableText,
  total: numeric,
  total_tax: numeric,
  shipping_total: numeric,
  discount_total: numeric,
  customer_note: text,
  billing: addressSchema,
  shipping: addressSchema,
  payment_method: text,
  payment_method_title: text,
  /** The customer's payment page for an unpaid order (WooCommerce 7+). */
  payment_url: nullableText.optional(),
  order_key: text,
  line_items: z
    .array(
      z.object({
        id: z.number(),
        name: text,
        product_id: z.number().nullish(),
        variation_id: z.number().nullish(),
        quantity: z.number(),
        subtotal: numeric,
        total: numeric,
        sku: nullableText,
        image: z.object({ src: z.string().nullish() }).nullish(),
        meta_data: z
          .array(
            z.object({
              key: z.string(),
              value: z.unknown(),
              display_key: z.string().optional(),
              display_value: z.unknown().optional(),
            }),
          )
          .default([]),
      }),
    )
    .default([]),
  coupon_lines: z.array(z.object({ code: text })).default([]),
  refunds: z.array(z.object({ total: numeric })).default([]),
  meta_data: z.array(metaSchema).default([]),
})
export type WooCommerceOrder = z.infer<typeof wooCommerceOrderSchema>

export const wooCommerceWebhookSchema = z.object({
  id: z.number(),
  name: text,
  /** `active`, `paused` or `disabled` (WooCommerce turns one off after failures). */
  status: text,
  topic: text,
  delivery_url: text,
})
export type WooCommerceWebhook = z.infer<typeof wooCommerceWebhookSchema>
