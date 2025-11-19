import { createSearchParamsCache } from "nuqs/server"

export const listMessageTemplatesRequest = createSearchParamsCache({})

export type ListMessageTemplatesRequest = Awaited<
  ReturnType<typeof listMessageTemplatesRequest.parse>
> & { chatbotId: string; id: string }
