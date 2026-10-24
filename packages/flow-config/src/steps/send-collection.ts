import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { baseStepSchema } from "./base"
import type { SendCardStepSchema } from "./send-card"
import { stepTypes } from "./step-action"

/** Messenger shows at most 10 cards in one carousel. */
export const COLLECTION_MAX_PRODUCTS = 10

export const collectionTypes = z.enum(["automated", "manual"])
export type CollectionType = z.infer<typeof collectionTypes>

const optionalId = (description: string) =>
  z
    .union([zodBigintAsString(), z.literal("")])
    .nullish()
    .transform((id) => id || null)
    .describe(description)

/**
 * A carousel of the store's products (spec images 28–29): `automated` picks
 * the products matching `conditions` when the step is sent, so new products
 * join by themselves; `manual` sends the chosen `productIds` in that order.
 * Only products the web shop shows are sent, at most 10. Each card opens the
 * product in the web shop, signed for the contact.
 */
export const sendCollectionStepSchema = baseStepSchema
  .extend({
    stepType: z
      .literal(stepTypes.enum.sendCollection)
      .describe('Step type discriminator: "sendCollection".'),
    dataType: z
      .literal("products")
      .describe('What the collection lists; only "products" for now.'),
    collectionType: collectionTypes.describe(
      "`automated`: the products matching `conditions` at send time. `manual`: the chosen `productIds`.",
    ),
    conditions: z
      .object({
        name: z
          .string()
          .trim()
          .max(255)
          .describe(
            "Part of the product name; empty for any. Only searchable products match a name.",
          ),
        categoryId: optionalId(
          "Category id (from `productCategories.list`); null for all. Its sub-categories count too.",
        ),
        subcategoryId: optionalId(
          "Sub-category id; null for all. Narrows `categoryId` when both are set.",
        ),
        vendorId: optionalId(
          "Vendor id (from `productVendors.list`); null for all.",
        ),
      })
      .describe("With `automated`: the filters a product must match."),
    productIds: z
      .array(zodBigintAsString())
      .max(COLLECTION_MAX_PRODUCTS)
      .describe(
        `With \`manual\`: product ids from \`products.list\`, in order (max ${COLLECTION_MAX_PRODUCTS}).`,
      ),
  })
  .refine(
    (step) => step.collectionType === "automated" || step.productIds.length > 0,
    { message: "Choose at least one product.", path: ["productIds"] },
  )

export type SendCollectionStepSchema = z.infer<typeof sendCollectionStepSchema>

/**
 * The step as it is sent: the product cards the collection resolved to for
 * one contact, filled by the sender — never authored or stored in a flow.
 */
export type SendCollectionResolvedStep = SendCollectionStepSchema & {
  cards: SendCardStepSchema[]
}

export const sendCollectionStepDefaultFn = (): SendCollectionStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.sendCollection,
  dataType: "products",
  collectionType: "automated",
  conditions: {
    name: "",
    categoryId: null,
    subcategoryId: null,
    vendorId: null,
  },
  productIds: [],
})
