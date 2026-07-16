export const GUEST_CONVERSATION_ID_KEY = "x-conversation-id" as const
export const LEGACY_GLOBAL_KEY = GUEST_CONVERSATION_ID_KEY

const memoryStorage = new Map<string, string>()

export const buildGuestStorageKey = (workspaceId: string, webchatId: string) =>
  `${GUEST_CONVERSATION_ID_KEY}:${workspaceId}:${webchatId}`

export const safeStorageGet = (key: string) => {
  try {
    return (
      globalThis.localStorage?.getItem(key) ?? memoryStorage.get(key) ?? null
    )
  } catch {
    return memoryStorage.get(key) ?? null
  }
}

export const safeStorageSet = (key: string, value: string) => {
  try {
    globalThis.localStorage?.setItem(key, value)
  } catch {
    memoryStorage.set(key, value)
  }
}

export const readLegacyGuestId = () => safeStorageGet(LEGACY_GLOBAL_KEY)
