import { shippingTypes } from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { publicContactIdentifier } from "@/lib/public-api/contact-identifier"

export const getWebshopLinkPublicRequest = z.object({
  contact: publicContactIdentifier
    .optional()
    .describe(
      "The customer the link is for, as id:123, email:… or phone:…; their cart and orders are kept under it. Omit for a preview link that browses the shop but cannot order. Get ids from `contacts.list`.",
    ),
  page: z
    .enum(["cart"])
    .optional()
    .describe("`cart` opens the customer's cart, ready to check out."),
  productId: zodBigintAsString()
    .optional()
    .describe(
      "Open this product's own page (instead of `page`). Get it from `products.list`.",
    ),
  vendorId: zodBigintAsString()
    .optional()
    .describe(
      "Open the shop on this vendor's products. Get it from `productVendors.list`.",
    ),
  categoryId: zodBigintAsString()
    .optional()
    .describe(
      "Open the shop on this category's products. Get it from `productCategories.list`.",
    ),
})

export const getWebshopLinkPublicResponse = z.object({
  url: z
    .string()
    .describe("Shop link; anyone with it shops as the customer it names."),
  buttonUrl: z
    .string()
    .describe(
      "The same page for a bot button or flow message: it carries `{{shop_token}}`, signed for each contact the message is sent to.",
    ),
  preview: z
    .boolean()
    .describe("True when the link names no customer and cannot order."),
  expiresInSeconds: z
    .number()
    .describe("How long the link works: 7 days, or 1 day for a preview."),
})

export const getCartPublicRequest = z.object({
  identifier: publicContactIdentifier.describe(
    "The customer, as id:123, email:… or phone:…. Get ids from `contacts.list`.",
  ),
})

const cartItem = z.object({
  productId: z.string(),
  variantId: z.string().nullable(),
  quantity: z.number(),
})

export const getCartPublicResponse = z.object({
  items: z
    .array(cartItem)
    .describe("What the customer put in the cart, as they left it."),
  currency: z.string().describe("ISO 4217 code all amounts are in."),
  shippingType: shippingTypes
    .nullable()
    .describe(
      "The shipping the prices assume; null when the store ships nothing.",
    ),
  lines: z
    .array(
      z.object({
        productId: z.string().nullish(),
        variantId: z.string().nullish(),
        name: z.string(),
        variantLabel: z.string().nullish(),
        imageUrl: z.string().nullish(),
        vendorName: z.string().nullish(),
        unitPrice: z.number(),
        quantity: z.number(),
        discountPercent: z.number(),
        discountTotal: z.number(),
        taxTotal: z.number(),
        lineTotal: z.number(),
      }),
    )
    .describe(
      "The items that can be ordered now, priced as an order would be.",
    ),
  totals: z.object({
    subtotal: z.number(),
    discountTotal: z.number(),
    shippingTotal: z.number(),
    serviceFeeTotal: z.number(),
    taxTotal: z.number(),
    couponDiscount: z.number(),
    total: z.number(),
  }),
  unavailable: z
    .array(
      cartItem.extend({
        variantId: z.string().nullish(),
        name: z
          .string()
          .nullable()
          .describe("Product name; null when the product was deleted."),
      }),
    )
    .describe(
      "Items that cannot be ordered now (turned off, deleted, vendor off, or a variant still to choose); left out of the totals.",
    ),
  enteredDiscountCode: z
    .string()
    .nullable()
    .describe("The discount code the customer typed on the cart."),
  discount: z
    .object({
      code: z.string(),
      amount: z.number(),
      discountType: z.string(),
      automatic: z
        .boolean()
        .describe("Applied by itself (an automatic code), not typed."),
    })
    .nullable()
    .describe("The discount code applied and what it takes off."),
  discountError: z
    .object({
      code: z.string(),
      data: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
    })
    .nullable()
    .describe("Why the typed code is not applied, e.g. `discountCodeExpired`."),
  availableDiscounts: z
    .array(
      z.object({
        code: z.string().describe("Apply it with the cart's discount code."),
        discountType: z.string(),
        discountValue: z
          .number()
          .describe(
            "Percent or amount, as set on the code; 0 for free shipping.",
          ),
        amount: z
          .number()
          .describe(
            "What it would take off this cart now; 0 unless `available`.",
          ),
        endsAt: z.date().nullable().describe("When it ends; null never ends."),
        status: z
          .enum(["available", "expired", "usedUp", "notEligible"])
          .describe(
            "`available` can be applied; `expired` (its end date passed), `usedUp` (no uses left, or this customer's one use spent) and `notEligible` (for customers matching a filter this one does not) are listed but refused.",
          ),
      }),
    )
    .describe(
      "Typed codes that are turned on and started, up to 20 — for every customer or for a customer filter: the ones this cart can use (`status: available`) first, most taken off first, then soonest to end; then ended, used-up or not-for-this-customer ones (`expired` / `usedUp` / `notEligible`), which cannot be applied. A code that does not fit the cart otherwise (minimum, products) is left out.",
    ),
  belowMinimum: z
    .number()
    .nullable()
    .describe(
      "The store's minimum order value when the cart is below it; null otherwise.",
    ),
})
