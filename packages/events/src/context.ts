// Re-export context functions from trigger and webhook
// This file is separate from index.ts to avoid Edge Runtime issues with AsyncLocalStorage
export {
  getTriggerExecutionContext,
  isWorkerContext,
  setTriggerExecutionContext,
} from "./trigger/context"

export {
  getWebhookExecutionContext,
  isWebhookContext,
  setWebhookExecutionContext,
} from "./webhook/context"
