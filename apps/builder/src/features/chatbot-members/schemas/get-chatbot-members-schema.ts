import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"

export const getChatbotMembersSearchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  keyword: parseAsString.withDefault(""),
})

export type GetChatbotMembersSchema = Awaited<
  ReturnType<typeof getChatbotMembersSearchParamsCache.parse>
> & {
  chatbotId: string
}
