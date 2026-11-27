import { templateParameterKinds } from "@chatbotx.io/flow-config"
import { z } from "zod"

/** One value an API caller fills for a template, keyed for `templateParams`. */
export const templateParameterResource = z.object({
  key: z
    .string()
    .describe(
      "Key to send in `templateParams`, e.g. `body.1`, `body.order_id`, `header`, `button.0`, `button.0.amount`, `card.0.body.1`, `offer.expiration_ms`.",
    ),
  component: z
    .enum(["header", "body", "button", "carousel", "limited_time_offer"])
    .describe("Template part the value goes into."),
  kind: templateParameterKinds.describe(
    "What to send: text, a public https media URL (`image`/`video`/`document`), a location part, a URL suffix, a coupon code, a catalog product retailer id, an offer expiry in Unix milliseconds, or a payment value (`pix_code`, `boleto_digitable_line`, `payment_link_url`, `payment_amount` as a major-unit decimal like `12.34`, `card_last_four_digits`, `card_credential_id`). The payment method is read from the template, never sent.",
  ),
  required: z.boolean().describe("Whether the send needs this value."),
  placeholder: z
    .string()
    .optional()
    .describe("The placeholder as written in the template, e.g. `{{1}}`."),
})

export const templateParametersField = z
  .array(templateParameterResource)
  .describe(
    "Values to fill when sending this template (e.g. `broadcasts.create` `templateParams`). Empty when the template has no variables.",
  )
