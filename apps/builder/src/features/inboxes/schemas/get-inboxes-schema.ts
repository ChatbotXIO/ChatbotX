import type { Inbox } from "@ahachat.ai/database"
import { createSearchParamsCache, parseAsInteger } from "nuqs/server"

export const getInboxesSearchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
})

export type GetInboxesSchema = Awaited<
  ReturnType<typeof getInboxesSearchParamsCache.parse>
> & { chatbotId: string }

export type InboxCollection = Inbox[]
