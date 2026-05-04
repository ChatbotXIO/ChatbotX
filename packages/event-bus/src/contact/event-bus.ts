import {
  type ContactEventListener,
  type ContactEventMap,
  type ContactEventType,
  contactEventSchemas,
  contactEventTypeSchema,
} from "@chatbotx.io/flow-config"
import { getRedisConnection } from "@chatbotx.io/worker-config"
import { BaseEventBus } from "../event-bus"

const MAX_CONTACT_EVENTS = 100_000

export const contactEventBus = new BaseEventBus<
  ContactEventMap,
  ContactEventListener
>(getRedisConnection(), {
  streamKey: "events:contact",
  consumerGroup: "contact-events-group",
  maxLen: MAX_CONTACT_EVENTS,
  schemas: contactEventSchemas,
})

export const ContactEventBusByType = Object.fromEntries(
  contactEventTypeSchema.options.map((type) => [type, contactEventBus]),
) as Record<ContactEventType, typeof contactEventBus>
