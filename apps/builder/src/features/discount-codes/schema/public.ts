import {
  discountAppliesTo,
  discountEligibilities,
  discountMinimumTypes,
  discountTypes,
  shippingTypes,
} from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { contactFilterCriteriaSchema } from "@/features/contact-filter/schema"
import { publicContactIdentifier } from "@/lib/public-api/contact-identifier"

export const publicDiscountCodeResource = z.object({
  id: z.string(),
  code: z.string().describe("What the customer types; matched ignoring case."),
  autoApply: z
    .boolean()
    .describe("Applied to web shop carts without the customer typing it."),
  discountType: discountTypes,
  discountValue: z
    .number()
    .describe(
      "Percent (`percentage`) or amount in the store currency (`fixedAmount`); 0 for `freeShipping`.",
    ),
  appliesTo: discountAppliesTo,
  categoryId: z
    .string()
    .nullable()
    .describe("With `appliesTo: category`; its sub-categories count too."),
  productIds: z.array(z.string()).describe("With `appliesTo: products`."),
  minimumType: discountMinimumTypes,
  minimumValue: z
    .number()
    .describe(
      "Amount (`amount`) or number of items (`quantity`) the lines the code applies to must reach.",
    ),
  usageLimit: z
    .number()
    .nullable()
    .describe("Uses in total; null is no limit."),
  usedCount: z.number().describe("Uses on orders not cancelled or deleted."),
  oncePerCustomer: z.boolean(),
  eligibility: discountEligibilities,
  customerFilter: z
    .object({
      operator: z.enum(["and", "or"]),
      conditions: z.array(z.unknown()),
      timezone: z.string().optional(),
    })
    .nullable()
    .describe("With `eligibility: specificCustomers`: the contacts it is for."),
  startsAt: z.date(),
  endsAt: z.date().nullable().describe("Null never ends."),
  isActive: z.boolean(),
  createdAt: z.date(),
})
export type DiscountCodeResource = z.infer<typeof publicDiscountCodeResource>

export const listDiscountCodesPublicRequest = z.object({
  code: z
    .string()
    .trim()
    .max(64)
    .optional()
    .describe("Only codes containing this, ignoring case."),
  page: z.coerce.number().int().min(1).optional().describe("Page, from 1."),
  perPage: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Codes per page, up to 100. Omit both for every code."),
})

export const listDiscountCodesPublicResponse = z.object({
  data: z.array(publicDiscountCodeResource),
  pageCount: z.number(),
})

export const discountCodeIdRequest = z.object({
  id: zodBigintAsString().describe(
    "Discount code id. Get it from `discountCodes.list`.",
  ),
})

/** Every field of the coupon form (image 11); the API and the UI share it. */
export const discountCodeWriteRequest = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{3,64}$/)
    .describe(
      "3–64 letters, digits, `-` or `_`. Unique per workspace, ignoring case. `discountCodes.generateCode` suggests a free one.",
    ),
  autoApply: z
    .boolean()
    .default(false)
    .describe(
      "Apply to web shop carts without the customer typing it. With several, the one taking off the most wins.",
    ),
  discountType: discountTypes.describe(
    "`percentage`, `fixedAmount` (store currency) or `freeShipping` (takes the delivery cost off).",
  ),
  discountValue: z
    .number()
    .min(0)
    .default(0)
    .describe(
      "Percent 1–100 or an amount above 0; ignored for `freeShipping`.",
    ),
  appliesTo: discountAppliesTo
    .default("entireOrder")
    .describe(
      "`entireOrder`, one `category` (`categoryId`) or chosen `products` (`productIds`). Ignored for `freeShipping`.",
    ),
  categoryId: zodBigintAsString()
    .nullish()
    .describe(
      "Category for `appliesTo: category`. Get it from `productCategories.list`.",
    ),
  productIds: z
    .array(zodBigintAsString())
    .max(500)
    .default([])
    .describe(
      "Products for `appliesTo: products`. Get them from `products.list`.",
    ),
  minimumType: discountMinimumTypes
    .default("none")
    .describe(
      "`none`, a minimum `amount` or a minimum `quantity` of items, read on the lines the code applies to.",
    ),
  minimumValue: z
    .number()
    .min(0)
    .default(0)
    .describe(
      "Amount or number of items for `minimumType` `amount` / `quantity`.",
    ),
  usageLimit: z
    .number()
    .int()
    .min(1)
    .nullish()
    .describe("Uses in total; omit or null for no limit."),
  oncePerCustomer: z
    .boolean()
    .default(false)
    .describe(
      "Each contact may use the code on one order (cancelled ones don't count).",
    ),
  eligibility: discountEligibilities
    .default("everyone")
    .describe(
      "`everyone`, or `specificCustomers`: only contacts matching `customerFilter`.",
    ),
  customerFilter: contactFilterCriteriaSchema
    .nullish()
    .describe(
      "Contacts the code is for, same filter as `contacts.list` (`contacts.listFilterFields`).",
    ),
  startsAt: z.coerce.date().optional().describe("ISO 8601; defaults to now."),
  endsAt: z.coerce.date().nullish().describe("ISO 8601; omit for never."),
  isActive: z
    .boolean()
    .default(true)
    .describe("Off refuses the code without deleting it."),
})
export type DiscountCodeWriteRequest = z.infer<typeof discountCodeWriteRequest>

const writeShape = discountCodeWriteRequest.shape

/**
 * `.partial()` alone would still backfill every defaulted field a PATCH omits
 * (zod resolves `.default()` through `.optional()`), silently resetting e.g.
 * `isActive` or `minimumType` on a code whose name alone was changed. Those
 * fields are re-made optional with their default stripped.
 */
const optionalWithoutDefault = <Inner extends z.ZodType>(
  field: z.ZodDefault<Inner>,
): z.ZodOptional<Inner> =>
  z.optional(field.removeDefault()).describe(field.description ?? "")

export const updateDiscountCodePublicRequest = discountCodeIdRequest.extend({
  ...discountCodeWriteRequest.partial().shape,
  autoApply: optionalWithoutDefault(writeShape.autoApply),
  discountValue: optionalWithoutDefault(writeShape.discountValue),
  appliesTo: optionalWithoutDefault(writeShape.appliesTo),
  productIds: optionalWithoutDefault(writeShape.productIds),
  minimumType: optionalWithoutDefault(writeShape.minimumType),
  minimumValue: optionalWithoutDefault(writeShape.minimumValue),
  oncePerCustomer: optionalWithoutDefault(writeShape.oncePerCustomer),
  eligibility: optionalWithoutDefault(writeShape.eligibility),
  isActive: optionalWithoutDefault(writeShape.isActive),
})

export const setDiscountCodeActivePublicRequest = discountCodeIdRequest.extend({
  isActive: z.boolean().describe("`true` turns the code on, `false` off."),
})

export const validateDiscountCodePublicRequest = z.object({
  code: z.string().trim().min(1).max(64).describe("The code to check."),
  items: z
    .array(
      z.object({
        productId: zodBigintAsString().describe(
          "Product id. Get it from `products.list`.",
        ),
        variantId: zodBigintAsString().nullish(),
        quantity: z.number().int().min(1).max(10_000),
      }),
    )
    .min(1)
    .max(100)
    .describe("The order the code would apply to."),
  contact: publicContactIdentifier
    .optional()
    .describe(
      "The customer, as id:… / email:… / phone:…; needed for codes limited to customers or to one use each.",
    ),
  shippingType: shippingTypes
    .optional()
    .describe("`delivery` or `pickup`; defaults to the store's first option."),
})

export const validateDiscountCodePublicResponse = z.object({
  valid: z.boolean(),
  amount: z
    .number()
    .describe("What the code takes off, in `currency`; 0 when not valid."),
  currency: z.string(),
  error: z
    .object({
      code: z
        .string()
        .describe(
          "Why it cannot be used, e.g. `discountCodeExpired`, `discountCodeMinimumNotMet`.",
        ),
      data: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
    })
    .nullable(),
  total: z.number().describe("The order total with the code when valid."),
})

export const generateDiscountCodePublicResponse = z.object({
  code: z.string().describe("A random 8-character code not taken yet."),
})

/** What the builder form posts; dates come as ISO strings. */
export const discountCodeFormRequest = discountCodeWriteRequest
