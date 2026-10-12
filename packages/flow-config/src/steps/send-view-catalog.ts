import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  SEND_VIEW_CATALOG_FOOTER_MAX,
  SEND_VIEW_CATALOG_TEXT_MAX,
} from "../channel-rules/send-view-catalog-length-rules"
import { flowValidationCodes } from "../validation-codes"
import { baseStepSchema } from "./base"
import { stepTypes } from "./step-action"

/**
 * Shares the channel's product catalog and lets the contact open it in the
 * chat. The button is rendered by the channel, so the step carries no label:
 * only the message around it.
 *
 * Caps at the widest limit any supporting channel accepts (see
 * `send-view-catalog-length-rules`), measured in UTF-16 units. The checks stay
 * on the fields: wrapping the object in a `superRefine` would make it a
 * ZodEffects and break the `z.discriminatedUnion("stepType", …)` that
 * `sendMessageNodeSchema` builds from it.
 */
export const sendViewCatalogStepSchema = baseStepSchema.extend({
  stepType: z
    .literal(stepTypes.enum.sendViewCatalog)
    .describe(
      'Step type discriminator: "sendViewCatalog" (shares the product catalog with a button to open it).',
    ),
  text: z
    .string()
    .trim()
    .min(1)
    .refine(
      (value) => value.length <= SEND_VIEW_CATALOG_TEXT_MAX,
      flowValidationCodes.sendViewCatalogBodyTooLong,
    )
    .meta({
      description: `Message text shown above the catalog button (max ${SEND_VIEW_CATALOG_TEXT_MAX} characters, counted in UTF-16 units so an emoji may count as 2). May include \`{{variable}}\` placeholders.`,
      maxLength: SEND_VIEW_CATALOG_TEXT_MAX,
    }),
  footer: z
    .string()
    .trim()
    .refine(
      (value) => value.length <= SEND_VIEW_CATALOG_FOOTER_MAX,
      flowValidationCodes.sendViewCatalogFooterTooLong,
    )
    .default("")
    .meta({
      description: `Optional small text under the message (max ${SEND_VIEW_CATALOG_FOOTER_MAX} characters, UTF-16 units; use an empty string for none). May include \`{{variable}}\` placeholders.`,
      maxLength: SEND_VIEW_CATALOG_FOOTER_MAX,
    }),
  thumbnailProductId: z
    .string()
    .trim()
    .default("")
    .describe(
      "Optional catalog product whose image is shown on the message: its Meta catalog `retailerId` (the Content ID in Commerce Manager), as returned by `products.searchMetaCatalogItems`. Use an empty string to let the channel pick one.",
    ),
})

export type SendViewCatalogStepSchema = z.infer<
  typeof sendViewCatalogStepSchema
>

/** The fields edited in the catalog button's dialog, as that form validates them. */
export const sendViewCatalogDetailsFormSchema = sendViewCatalogStepSchema.pick({
  footer: true,
  thumbnailProductId: true,
})
export type SendViewCatalogDetailsFormInput = z.input<
  typeof sendViewCatalogDetailsFormSchema
>
export type SendViewCatalogDetailsFormValues = z.output<
  typeof sendViewCatalogDetailsFormSchema
>

export const sendViewCatalogStepDefaultFn = (
  props: Partial<SendViewCatalogStepSchema> = {},
): SendViewCatalogStepSchema => ({
  text: "",
  footer: "",
  thumbnailProductId: "",
  ...props,
  id: createId(),
  stepType: stepTypes.enum.sendViewCatalog,
})
