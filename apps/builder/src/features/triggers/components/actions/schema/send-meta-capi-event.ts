import { triggerActions } from "@chatbotx.io/database/partials"
import {
  metaCapiContentTextSchema,
  metaCapiCurrencySchema,
  metaCapiFlowEventNameSchema,
  metaCapiValueSchema,
} from "@chatbotx.io/flow-config"
import z from "zod"

export const sendMetaCapiEvent = z.object({
  type: z.literal(triggerActions.enum.sendMetaCapiEvent),
  eventName: metaCapiFlowEventNameSchema.default("LeadSubmitted"),
  value: metaCapiValueSchema,
  currency: metaCapiCurrencySchema,
  contentCategory: metaCapiContentTextSchema,
  contentName: metaCapiContentTextSchema,
})
export type SendMetaCapiEvent = z.infer<typeof sendMetaCapiEvent>

export const defaultFn = (): SendMetaCapiEvent => ({
  type: triggerActions.enum.sendMetaCapiEvent,
  eventName: "LeadSubmitted",
  value: undefined,
  currency: undefined,
  contentCategory: undefined,
  contentName: undefined,
})
