import { AsyncLocalStorage } from "node:async_hooks"

type ExecutionContext = {
  source?: "webhook"
}

const asyncLocalStorage = new AsyncLocalStorage<ExecutionContext>()

export function setWebhookExecutionContext(context: ExecutionContext) {
  return asyncLocalStorage.enterWith(context)
}

export function getWebhookExecutionContext(): ExecutionContext | undefined {
  return asyncLocalStorage.getStore()
}

export function isWebhookContext(): boolean {
  const context = getWebhookExecutionContext()
  return context?.source === "webhook"
}
