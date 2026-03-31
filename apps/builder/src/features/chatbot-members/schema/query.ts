import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"
import { z } from "zod"
import { userResource } from "@/features/users/schemas/resource"
import { chatbotMemberResource } from "./resource"

export const getChatbotMembersSearchParamsCache = createSearchParamsCache({
  page: parseAsInteger,
  perPage: parseAsInteger,
  keyword: parseAsString,
})

export type GetChatbotMembersSchema = Awaited<
  ReturnType<typeof getChatbotMembersSearchParamsCache.parse>
> & {
  chatbotId: bigint
}

export const listChatbotMembersRequest = z.object({
  chatbotId: z.bigint(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).default(10),
  keyword: z.string().nullish(),
})
export type ListChatbotMembersRequest = z.infer<
  typeof listChatbotMembersRequest
>

export const listChatbotMembersResponse = z.object({
  data: z.array(
    chatbotMemberResource.extend({
      user: userResource.pick({ id: true, name: true }),
    }),
  ),
  pageCount: z.number(),
})
export type ListChatbotMembersResponse = z.infer<
  typeof listChatbotMembersResponse
>
