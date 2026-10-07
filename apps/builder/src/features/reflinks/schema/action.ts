import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

const REF_LINK_NAME_REGEX = /^[a-zA-Z0-9]+$/

export const createReflinkRequest = z.object({
  name: z
    .string()
    .min(1)
    .max(50)
    .refine((value) => REF_LINK_NAME_REGEX.test(value))
    .describe("Ref link name, alphanumeric only."),
  flowId: zodBigintAsString().describe(
    "Flow to trigger when the ref link is opened. Get it from `flows.list`.",
  ),
  customFieldId: z
    .union([z.literal("").transform(() => null), zodBigintAsString()])
    .nullable()
    .describe(
      "Custom field to stamp a click identifier into, or null for none.",
    ),
})
export type CreateReflinkRequest = z.infer<typeof createReflinkRequest>

export const updateReflinkRequest = createReflinkRequest.partial()
export type UpdateReflinkRequest = z.infer<typeof updateReflinkRequest>

export const MAX_WIDGET_AUTHORIZED_DOMAINS = 50
// Only bounds the `IN (...)` list the service builds from it — far above any
// real workspace's inbox count.
const MAX_WIDGET_HIDDEN_INBOXES = 500
const MAX_WIDGET_BRAND_NAME_LENGTH = 100
const MAX_WIDGET_URL_LENGTH = 2048
const HEX_COLOR_REGEX = /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/

/**
 * Why the brand name and URL were rejected together. Passed as the issue's
 * `params.reason` so the form can show a translated message.
 */
export const widgetBrandIssueReasons = [
  "brandUrlRequiredWithName",
  "brandNameRequiredWithUrl",
] as const
export type WidgetBrandIssueReason = (typeof widgetBrandIssueReasons)[number]

export const updateReflinkWidgetRequest = z
  .object({
    authorizedDomains: z
      .array(z.hostname())
      .max(MAX_WIDGET_AUTHORIZED_DOMAINS)
      .describe(
        "Domains allowed to embed the chat widget. Empty = any domain.",
      ),
    hiddenInboxIds: z
      .array(zodBigintAsString())
      .max(MAX_WIDGET_HIDDEN_INBOXES)
      .describe("Inboxes hidden from the chat widget."),
    logoFileId: z
      .union([z.literal(""), zodBigintAsString()])
      .describe(
        "Media library file shown on the widget's toggle button. Empty = the default chat icon.",
      ),
    // The color picker emits #RRGGBB, or #RRGGBBAA when alpha is lowered.
    logoBackgroundColor: z
      .string()
      .regex(HEX_COLOR_REGEX)
      .describe(
        "Background of the default chat icon, as a #RRGGBB or #RRGGBBAA hex code.",
      ),
    brandName: z
      .string()
      .trim()
      .max(MAX_WIDGET_BRAND_NAME_LENGTH)
      .describe(
        "Brand name shown in the widget's powered-by line. Set together with `brandUrl`; both empty = no powered-by line.",
      ),
    // http(s) only: the widget renders it as a link on a third-party site.
    brandUrl: z
      .union([
        z.literal(""),
        z.url({ protocol: /^https?$/ }).max(MAX_WIDGET_URL_LENGTH),
      ])
      .describe(
        "Where the powered-by brand name links to, as entered. Set together with `brandName`.",
      ),
  })
  // The powered-by line needs both its name and its link, or neither.
  .superRefine((input, ctx) => {
    if (input.brandName && !input.brandUrl) {
      ctx.addIssue({
        code: "custom",
        path: ["brandUrl"],
        input: "",
        params: { reason: "brandUrlRequiredWithName" },
      })
    }
    if (input.brandUrl && !input.brandName) {
      ctx.addIssue({
        code: "custom",
        path: ["brandName"],
        input: "",
        params: { reason: "brandNameRequiredWithUrl" },
      })
    }
  })
export type UpdateReflinkWidgetRequest = z.infer<
  typeof updateReflinkWidgetRequest
>
