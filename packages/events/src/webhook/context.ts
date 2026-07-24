import { AsyncLocalStorage } from "node:async_hooks"

type ExecutionContext = {
  source?: "webhook"
}

const asyncLocalStorage = new AsyncLocalStorage<ExecutionContext>()

export function setWebhookExecutionContext(context: ExecutionContext) {
  return asyncLocalStorage.enterWith(context)
}

export function runWithWebhookExecutionContext<T>(
  context: ExecutionContext,
  callback: () => T,
): T {
  return asyncLocalStorage.run(context, callback)
}

export function getWebhookExecutionContext(): ExecutionContext | undefined {
  return asyncLocalStorage.getStore()
}

export function isWebhookContext(): boolean {
  const context = asyncLocalStorage.getStore()
  return context?.source === "webhook"
}

export function webhookChannelOrigin(): "channel" | undefined {
  return isWebhookContext() ? "channel" : undefined
}
