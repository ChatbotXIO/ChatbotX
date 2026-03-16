type ExecutionContext = {
  source?: "worker"
}

type AsyncLocalStorageType = {
  enterWith: (context: ExecutionContext) => void
  getStore: () => ExecutionContext | undefined
}

let asyncLocalStorage: AsyncLocalStorageType | null = null

// Try to load AsyncLocalStorage - will fail in Edge Runtime
async function initAsyncLocalStorage() {
  try {
    const asyncHooks = await import("node:async_hooks")
    return new asyncHooks.AsyncLocalStorage()
  } catch (e) {
    console.error("Failed to load AsyncLocalStorage:", e)
    return null
  }
}

// Initialize async - will be null initially, then populated
initAsyncLocalStorage().then((storage) => {
  asyncLocalStorage = storage as AsyncLocalStorageType | null
})

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
