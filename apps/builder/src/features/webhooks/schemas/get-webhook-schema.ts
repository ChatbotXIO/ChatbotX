import { getSortingStateParser } from "@aha.chat/ui/lib/parsers"
import type { WebhookModel } from "node_modules/@aha.chat/database/src/generated/prisma/models/Webhook"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"

export const getWebhooksSearchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  sort: getSortingStateParser<WebhookModel>().withDefault([
    { id: "createdAt", desc: true },
  ]),
  name: parseAsString.withDefault(""),
  folderId: parseAsString,
})

export type GetWebhooksSchema = Awaited<
  ReturnType<typeof getWebhooksSearchParamsCache.parse>
> & {
  chatbotId: string
}
