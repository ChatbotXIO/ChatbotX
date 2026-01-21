import { AsyncLocalStorage } from "node:async_hooks"

type ExecutionContext = {
  source?: string
}

const asyncLocalStorage = new AsyncLocalStorage<ExecutionContext>()

export function setExecutionContext(context: ExecutionContext) {
  return asyncLocalStorage.enterWith(context)
}

export function getExecutionContext(): ExecutionContext | undefined {
  return asyncLocalStorage.getStore()
}

export function isWebhookContext(): boolean {
  const context = getExecutionContext()
  return context?.source === "webhook"
}
