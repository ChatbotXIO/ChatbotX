// Main unified emitters
export * from "./event-dispatcher"

// Trigger events
export * from "./trigger/cache"
export {
  getTriggerExecutionContext,
  isWorkerContext,
  setTriggerExecutionContext,
} from "./trigger/context"
export * as TriggerEventEmitter from "./trigger/emitter"
export type { TriggerEventType } from "./trigger/types"

// Webhook events
export * from "./webhook/cache"
export {
  getWebhookExecutionContext,
  isWebhookContext,
  setWebhookExecutionContext,
} from "./webhook/context"
export * as WebhookEventEmitter from "./webhook/emitter"
export type { WebhookEventType } from "./webhook/types"
