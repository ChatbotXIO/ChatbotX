import type { WebhookModel } from "@chatbotx.io/database/types"
import { getSortingStateParser } from "@chatbotx.io/ui/lib/parsers"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"
import { parseAsBigInt } from "@/lib/nuqs"

export const getWebhooksSearchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  sort: getSortingStateParser<WebhookModel>().withDefault([
    { id: "createdAt", desc: true },
  ]),
  name: parseAsString.withDefault(""),
  folderId: parseAsBigInt,
})

export type GetWebhooksSchema = Awaited<
  ReturnType<typeof getWebhooksSearchParamsCache.parse>
> & {
  workspaceId: string
}
