import { channelTypes } from "@chatbotx.io/utils/channel"
import { z } from "zod"

const SENDABLE_PRODUCTS_KEYWORD_MAX = 255

/** A flow step holds at most the 30 products a multi-product message can show. */
export const SENDABLE_PRODUCT_IDS_MAX = 50

export const listSendableProductsRequest = z.object({
  channel: channelTypes.describe(
    "Channel the `sendProducts` step will send over, e.g. `whatsapp`. Channels that support product messages are listed in `capabilities.get`.",
  ),
  keyword: z
    .string()
    .trim()
    .min(1)
    .max(SENDABLE_PRODUCTS_KEYWORD_MAX)
    .optional()
    .describe("Only products whose name contains this text."),
})

const sendableProductResource = z.object({
  id: z
    .string()
    .describe(
      "Product id. Use it in a `sendProducts` step's `sections[].productIds`.",
    ),
  name: z.string().describe("Product name."),
  imageUrl: z.string().nullable().describe("First product image, if any."),
  price: z.number().describe("Product price."),
  currency: z.string().describe("ISO 4217 currency code."),
})

export const listSendableProductsResponse = z.object({
  ready: z
    .boolean()
    .describe(
      "false when no products can be offered; `reason` says why and `data` is empty.",
    ),
  reason: z
    .enum(["channelUnsupported", "catalogNotConnected"])
    .optional()
    .describe(
      "`channelUnsupported`: the channel cannot send products. `catalogNotConnected`: connect and sync a Meta Catalog first (see `products.getMetaCatalog`).",
    ),
  data: z.array(sendableProductResource),
  pageCount: z.number().describe("Total number of pages."),
})
