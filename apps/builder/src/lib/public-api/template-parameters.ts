import { z } from "zod"

/** One value an API caller fills for a template, keyed for `templateParams`. */
export const templateParameterResource = z.object({
  key: z
    .string()
    .describe(
      "Key to send in `templateParams`, e.g. `body.1`, `body.order_id`, `header`, `button.0`, `card.0.body.1`, `offer.expiration_ms`.",
    ),
  component: z
    .enum(["header", "body", "button", "carousel", "limited_time_offer"])
    .describe("Template part the value goes into."),
  kind: z
    .enum([
      "text",
      "image",
      "video",
      "document",
      "latitude",
      "longitude",
      "location_name",
      "location_address",
      "url_suffix",
      "coupon_code",
      "catalog_product",
      "expiration_ms",
    ])
    .describe(
      "What to send: text, a public https media URL (`image`/`video`/`document`), a location part, a URL suffix, a coupon code, a catalog product retailer id, or an offer expiry in Unix milliseconds.",
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
