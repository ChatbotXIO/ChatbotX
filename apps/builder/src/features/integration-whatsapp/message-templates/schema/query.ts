import { zodBigintAsString } from "@chatbotx.io/utils"
import { createSearchParamsCache } from "nuqs/server"
import z from "zod"
import { whatsappMessageTemplateResource } from "./resource"

export const listMessageTemplatesRequest = createSearchParamsCache({})

export type ListMessageTemplatesRequest = Awaited<
  ReturnType<typeof listMessageTemplatesRequest.parse>
> & { workspaceId: string; id?: string }

export const listMessageTemplatesInputSchema = z.object({
  workspaceId: zodBigintAsString(),
  id: zodBigintAsString(),
})

export const listWhatsappMessageTemplatesResponse = z.array(
  whatsappMessageTemplateResource,
)
export type ListWhatsappMessageTemplatesResponse = z.infer<
  typeof listWhatsappMessageTemplatesResponse
>
