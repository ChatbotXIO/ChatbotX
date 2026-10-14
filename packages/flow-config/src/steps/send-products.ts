import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { countMessageCharacters } from "../channel-rules/characters"
import { flowValidationCodes } from "../validation-codes"
import { baseStepSchema } from "./base"
import { stepTypes } from "./step-action"

/**
 * Product-message step: shows products from the workspace catalog. The step
 * stores ChatbotX product ids only — how a channel renders them, and which
 * catalog id they map to there, is resolved at send time.
 */
export const sendProductsDisplays = z.enum(["products", "carousel"])
export type SendProductsDisplay = z.infer<typeof sendProductsDisplays>

/**
 * Hard cap that keeps unbounded text out of the persisted flow JSON. The limits
 * a channel actually enforces are lower and live in the channel policy.
 *
 * Measured with `countMessageCharacters`, not `.max()`, so an emoji counts once
 * here exactly as it does in the editor's counter and the per-channel rules. The
 * check stays on the field so the step schema remains a plain object schema,
 * which the `z.discriminatedUnion("stepType", …)` in `sendMessageNodeSchema`
 * needs (an intersection from `.and()` would not be accepted there).
 */
export const SEND_PRODUCTS_TEXT_MAX = 4096

const sendProductsTextSchema = z
  .string()
  .trim()
  .refine(
    (value) => countMessageCharacters(value) <= SEND_PRODUCTS_TEXT_MAX,
    flowValidationCodes.sendProductsFieldTooLong,
  )

export const sendProductsSectionSchema = z.object({
  title: sendProductsTextSchema
    .optional()
    .describe(
      "Section title. Required by some channels once there are 2+ sections.",
    ),
  productIds: z
    .array(zodBigintAsString())
    .describe(
      "Product ids in this section. Get them from `products.listSendable`.",
    ),
})
export type SendProductsSection = z.infer<typeof sendProductsSectionSchema>

/**
 * What a product message says, without anything specific to a flow step. A flow
 * step extends it; a message sent outside a flow (inbox, public API) is exactly
 * this, so both are validated and resolved by the same rules.
 */
export const sendProductsContentSchema = z.object({
  display: sendProductsDisplays.describe(
    '"products": one product, or a list of products grouped in sections. "carousel": 2+ products as scrollable cards.',
  ),
  header: sendProductsTextSchema
    .optional()
    .describe('Header text. Only for the "products" display with 2+ products.'),
  body: sendProductsTextSchema
    .optional()
    .describe(
      "Message text. Required for most displays, see the channel capabilities.",
    ),
  footer: sendProductsTextSchema.optional().describe("Optional footer text."),
  sections: z
    .array(sendProductsSectionSchema)
    .describe(
      'Product sections. "products": 1+ sections; "carousel": exactly one untitled section.',
    ),
})
export type SendProductsContent = z.infer<typeof sendProductsContentSchema>

export const sendProductsStepSchema = baseStepSchema.extend({
  stepType: z
    .literal(stepTypes.enum.sendProducts)
    .describe('Step type discriminator: "sendProducts".'),
  ...sendProductsContentSchema.shape,
})
export type SendProductsStepSchema = z.infer<typeof sendProductsStepSchema>

/**
 * Structure that holds on every channel. Section and product counts and text
 * limits are per-channel and live in the channel policy (`productMessages`).
 */
export const refineSendProductsStructure = (
  content: SendProductsContent,
  ctx: z.RefinementCtx,
): void => {
  const seen = new Set<string>()
  content.sections.forEach((section, sectionIndex) => {
    if (section.productIds.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["sections", sectionIndex, "productIds"],
        message: flowValidationCodes.sendProductsProductCountOutOfRange,
      })
    }
    for (const productId of section.productIds) {
      if (seen.has(productId)) {
        ctx.addIssue({
          code: "custom",
          path: ["sections", sectionIndex, "productIds"],
          message: flowValidationCodes.sendProductsDuplicateProduct,
        })
      }
      seen.add(productId)
    }
  })
}

export const sendProductsStepDefaultFn = (
  props: Partial<SendProductsStepSchema> = {},
): SendProductsStepSchema => ({
  display: "products",
  sections: [{ productIds: [] }],
  ...props,
  id: createId(),
  stepType: stepTypes.enum.sendProducts,
})
