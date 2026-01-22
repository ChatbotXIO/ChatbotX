import { AsyncLocalStorage } from "node:async_hooks"

type ExecutionContext = {
  source?: "worker"
}

const asyncLocalStorage = new AsyncLocalStorage<ExecutionContext>()

export function setTriggerExecutionContext(context: ExecutionContext) {
  return asyncLocalStorage.enterWith(context)
}

export function getTriggerExecutionContext(): ExecutionContext | undefined {
  return asyncLocalStorage.getStore()
}

export function isWorkerContext(): boolean {
  const context = getTriggerExecutionContext()
  return context?.source === "worker"
}
