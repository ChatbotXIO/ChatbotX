import { triggerActions } from "@chatbotx.io/database/partials"
import {
  metaCapiEventFieldsSchema,
  withMetaCapiEventRefinements,
} from "@chatbotx.io/flow-config"
import z from "zod"

export const sendMetaCapiEvent = withMetaCapiEventRefinements(
  metaCapiEventFieldsSchema.extend({
    type: z.literal(triggerActions.enum.sendMetaCapiEvent),
  }),
)
export type SendMetaCapiEvent = z.infer<typeof sendMetaCapiEvent>

export const defaultFn = (): SendMetaCapiEvent => ({
  type: triggerActions.enum.sendMetaCapiEvent,
  eventName: "LeadSubmitted",
  actionSource: "business_messaging",
  contentType: undefined,
  contentIds: undefined,
  value: undefined,
  currency: undefined,
  contentCategory: undefined,
  contentName: undefined,
})
