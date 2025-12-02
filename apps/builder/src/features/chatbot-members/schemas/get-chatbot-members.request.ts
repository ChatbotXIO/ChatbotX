import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"
import { z } from "zod"

export const getChatbotMembersSearchParamsCache = createSearchParamsCache({
  page: parseAsInteger,
  perPage: parseAsInteger,
  keyword: parseAsString,
})

export type GetChatbotMembersSchema = Awaited<
  ReturnType<typeof getChatbotMembersSearchParamsCache.parse>
> & {
  chatbotId: string
}

export const listChatbotMembersRequest = z.object({
  chatbotId: z.cuid2(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).default(10),
  keyword: z.string().nullish(),
})
export type ListChatbotMembersRequest = z.infer<
  typeof listChatbotMembersRequest
>
