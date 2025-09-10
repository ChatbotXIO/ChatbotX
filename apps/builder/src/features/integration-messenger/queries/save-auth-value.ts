import type { BaseAuthValue } from "@aha.chat/sdk"
import { unstable_cache } from "next/cache"
import { calcCacheTags } from "@/lib/cache-helper"

export const saveAuthValueToCache = (
  chatbotId: string,
  authResult?: BaseAuthValue,
): Promise<BaseAuthValue | undefined> => {
  return unstable_cache(
    async () => Promise.resolve(authResult),
    ["messengerAuthValue", chatbotId],
    calcCacheTags(`chatbots:${chatbotId}#messengerAuthValue`),
  )()
}
