// Main unified emitters

export type {
  CartAbandonedMetadata,
  CartItemEventMetadata,
  CommerceEventProduct,
  OrderEventMetadata,
  PipelineItemEventMetadata,
  PostCommentEventMetadata,
  ShoppingCartSentMetadata,
  UserAskedAboutProductMetadata,
} from "./base-emitter"
export * from "./contact-inbox-context"
export * from "./context"
export * from "./decision-flow-lineage"
export * from "./event-dispatcher"
export * from "./event-type-registry"
export * from "./post-comment-context"
// Trigger events
export * from "./trigger/cache"
export * as TriggerEventEmitter from "./trigger/emitter"

// Webhook events
export * from "./webhook/cache"
export * as WebhookEventEmitter from "./webhook/emitter"

// NOTE: Context functions are exported from @chatbotx.io/events/context
// to avoid Edge Runtime issues with AsyncLocalStorage
