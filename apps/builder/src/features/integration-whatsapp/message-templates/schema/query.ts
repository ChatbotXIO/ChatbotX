import { createSearchParamsCache } from "nuqs/server"
import z from "zod"
import { whatsappMessageTemplateResouce } from "./resource"

export const listMessageTemplatesRequest = createSearchParamsCache({})

export type ListMessageTemplatesRequest = Awaited<
  ReturnType<typeof listMessageTemplatesRequest.parse>
> & { chatbotId: bigint; id?: bigint }

export const listMessageTemplatesInputSchema = z.object({
  chatbotId: z.bigint(),
  id: z.bigint(),
})

export const listWhatsappMessageTemplatesResponse = z.array(
  whatsappMessageTemplateResouce,
)
export type ListWhatsappMessageTemplatesResponse = z.infer<
  typeof listWhatsappMessageTemplatesResponse
>
