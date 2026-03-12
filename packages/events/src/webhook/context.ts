type ExecutionContext = {
  source?: "webhook"
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

export function setWebhookExecutionContext(context: ExecutionContext) {
  if (!asyncLocalStorage) {
    return
  }
  return asyncLocalStorage.enterWith(context)
}

export function getWebhookExecutionContext(): ExecutionContext | undefined {
  if (!asyncLocalStorage) {
    return undefined
  }
  return asyncLocalStorage.getStore()
}

export function isWebhookContext(): boolean {
  if (!asyncLocalStorage) {
    return false
  }
  const context = asyncLocalStorage.getStore()
  return context?.source === "webhook"
}
