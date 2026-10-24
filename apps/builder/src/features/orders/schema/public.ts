import {
  orderActorTypes,
  orderShippingAddressSchema,
  orderSources,
  orderStatuses,
  paymentMethods,
  paymentStatuses,
  shippingTypes,
} from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { publicContactIdentifier } from "@/lib/public-api/contact-identifier"

export const publicOrderResource = z.object({
  id: z.string(),
  number: z.number().describe("Order number, counted per workspace."),
  status: orderStatuses,
  source: orderSources,
  paymentMethod: paymentMethods,
  paymentStatus: paymentStatuses,
  currency: z.string().describe("ISO 4217 code all amounts are in."),
  subtotal: z.number().describe("Sum of the lines before discounts and tax."),
  discountTotal: z.number(),
  shippingTotal: z.number(),
  serviceFeeTotal: z.number(),
  taxTotal: z.number(),
  couponDiscount: z
    .number()
    .describe("Taken off by the discount code (`discountCode`)."),
  discountCode: z
    .string()
    .nullable()
    .describe("The discount code the order used, kept if the code is deleted."),
  total: z.number().describe("What the customer pays."),
  contactId: z.string().nullable(),
  conversationId: z.string().nullable(),
  inboxId: z.string().nullable(),
  channel: z.string().nullable(),
  customerName: z.string().nullable(),
  customerEmail: z.string().nullable(),
  customerPhone: z.string().nullable(),
  shippingType: shippingTypes.nullable(),
  shippingAddress: orderShippingAddressSchema.nullable(),
  note: z.string().nullable(),
  rating: z
    .number()
    .nullable()
    .describe("1–5 when the customer rated the order."),
  ratingComment: z.string().nullable(),
  cancelReason: z.string().nullable(),
  acceptedAt: z.date().nullable(),
  shippedAt: z.date().nullable(),
  concludedAt: z.date().nullable(),
  cancelledAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export const publicOrderListItemResource = publicOrderResource.extend({
  itemCount: z.number().describe("Total quantity across the order's lines."),
})

export const publicOrderItemResource = z.object({
  id: z.string(),
  productId: z
    .string()
    .nullable()
    .describe("Null once the product is deleted or for an unlinked item."),
  variantId: z.string().nullable(),
  vendorId: z.string().nullable(),
  name: z.string(),
  variantLabel: z.string().nullable(),
  sku: z.string().nullable(),
  retailerId: z.string().nullable(),
  imageUrl: z.string().nullable(),
  vendorName: z.string().nullable(),
  unitPrice: z.number(),
  quantity: z.number(),
  discountPercent: z.number(),
  taxPercent: z.number(),
  discountTotal: z.number(),
  taxTotal: z.number(),
  lineTotal: z.number(),
})

export const publicOrderHistoryResource = z.object({
  id: z.string(),
  fromStatus: orderStatuses.nullable(),
  toStatus: orderStatuses,
  actorType: orderActorTypes,
  actorUser: z
    .object({ id: z.string(), name: z.string().nullable() })
    .nullish(),
  note: z.string().nullable(),
  createdAt: z.date(),
})

export const publicOrderDetailResource = publicOrderResource.extend({
  items: z.array(publicOrderItemResource),
  history: z.array(publicOrderHistoryResource),
})
export type OrderDetailResource = z.infer<typeof publicOrderDetailResource>

export const listOrdersPublicRequest = z.object({
  status: z
    .array(orderStatuses)
    .optional()
    .describe("Only orders in these statuses."),
  source: z
    .array(orderSources)
    .optional()
    .describe("Only orders from these sources."),
  contactId: zodBigintAsString()
    .optional()
    .describe("Only this contact's orders. Get it from `contacts.list`."),
  from: z.coerce
    .date()
    .optional()
    .describe("Placed at or after this time (ISO 8601)."),
  to: z.coerce
    .date()
    .optional()
    .describe("Placed before this time (ISO 8601)."),
  keyword: z
    .string()
    .trim()
    .max(255)
    .optional()
    .describe(
      "An order number, or part of the customer's name, phone or email.",
    ),
  page: z.coerce
    .number()
    .int()
    .min(1)
    .default(1)
    .describe("Page, from 1; defaults to 1."),
  // Always paged: each order carries its lines, so "every order" is unbounded.
  perPage: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe("Orders per page, up to 100; defaults to 20."),
})

export const listOrdersPublicResponse = z.object({
  data: z.array(publicOrderListItemResource),
  pageCount: z.number(),
})

export const createOrderPublicRequest = z.object({
  contact: publicContactIdentifier
    .optional()
    .describe(
      "The customer, as id:123, email:… or phone:…. Optional; get ids from `contacts.list`.",
    ),
  items: z
    .array(
      z.object({
        productId: zodBigintAsString().describe(
          "Product id. Get it from `products.list`.",
        ),
        variantId: zodBigintAsString()
          .nullish()
          .describe(
            "Required for a product with variants: an enabled variant id from `products.get`.",
          ),
        quantity: z.number().int().min(1).max(10_000),
      }),
    )
    .min(1)
    .max(100)
    .describe("What is ordered. Prices come from the products."),
  customerName: z
    .string()
    .trim()
    .max(255)
    .nullish()
    .describe("Buyer name shown on the order."),
  customerEmail: z
    .string()
    .trim()
    .email()
    .max(255)
    .nullish()
    .describe("Buyer email."),
  customerPhone: z
    .string()
    .trim()
    .max(64)
    .nullish()
    .describe("Buyer phone number."),
  shippingType: shippingTypes
    .nullish()
    .describe("Defaults to the store's shipping type."),
  shippingAddress: orderShippingAddressSchema
    .nullish()
    .describe("Where to deliver; ignored for store pickup."),
  note: z
    .string()
    .trim()
    .max(2000)
    .nullish()
    .describe("Customer note shown on the order."),
  discountCode: z
    .string()
    .trim()
    .max(64)
    .nullish()
    .describe(
      "A discount code to apply (`discountCodes.list`); one that cannot be used refuses the order. Check it first with `discountCodes.validate`.",
    ),
})

export const orderIdRequest = z.object({
  id: zodBigintAsString().describe("Order id. Get it from `orders.list`."),
})

export const transitionOrderPublicRequest = orderIdRequest.extend({
  message: z
    .string()
    .trim()
    .max(1000)
    .nullish()
    .describe(
      "Optional message sent to the customer in the order's conversation and kept on the order's history (as the reason, when cancelling).",
    ),
})
