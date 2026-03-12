type ExecutionContext = {
  source?: "worker"
}

type AsyncLocalStorageType = {
  enterWith: (context: ExecutionContext) => void
  getStore: () => ExecutionContext | undefined
}

let asyncLocalStorage: AsyncLocalStorageType | null = null

// Try to load AsyncLocalStorage - will fail in Edge Runtime
function initAsyncLocalStorage() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const asyncHooks = require("node:async_hooks")
    return new asyncHooks.AsyncLocalStorage()
  } catch {
    return null
  }
}

asyncLocalStorage = initAsyncLocalStorage()

export function setTriggerExecutionContext(context: ExecutionContext) {
  if (!asyncLocalStorage) {
    return
  }
  return asyncLocalStorage.enterWith(context)
}

export function getTriggerExecutionContext(): ExecutionContext | undefined {
  if (!asyncLocalStorage) {
    return undefined
  }
  return asyncLocalStorage.getStore()
}

export function isWorkerContext(): boolean {
  if (!asyncLocalStorage) {
    return false
  }
  const context = asyncLocalStorage.getStore()
  return context?.source === "worker"
}
