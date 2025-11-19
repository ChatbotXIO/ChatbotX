import { createSearchParamsCache } from "nuqs/server"

export const listWhatsappFlowsRequest = createSearchParamsCache({})

export type ListWhatsappFlowsRequest = Awaited<
  ReturnType<typeof listWhatsappFlowsRequest.parse>
> & {
  chatbotId: string
  id: string
}
