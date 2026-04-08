import { zodBigintAsString } from "@chatbotx.io/utils"
import { createSearchParamsCache, parseAsInteger } from "nuqs/server"
import { z } from "zod"
import { integrationMessengerResource } from "@/features/integration-messenger/schema/resource"
import { integrationWebchatResource } from "@/features/integration-webchat/schema/resource"
import { integrationWhatsappResource } from "@/features/integration-whatsapp/schemas/resource"
import { integrationZaloResource } from "@/features/integration-zalo/schemas/resource"
import { basePaginationRequest } from "@/lib/pagination"
import { inboxResource } from "./resource"

export const listInboxesNuqs = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
})

export const listInboxesRequest = basePaginationRequest.extend({
  workspaceId: zodBigintAsString(),
  includes: z.array(z.literal("integration")).optional(),
})
export type ListInboxesRequest = z.infer<typeof listInboxesRequest>

export const publishInboxesRequest = listInboxesRequest.omit({
  workspaceId: true,
})
export type PublishInboxesRequest = z.infer<typeof publishInboxesRequest>

export const listInboxesResponse = z.object({
  data: z.array(
    inboxResource.extend({
      integrationWhatsapp: integrationWhatsappResource.optional(),
      integrationWebchat: integrationWebchatResource.optional(),
      integrationMessenger: integrationMessengerResource.optional(),
      integrationZalo: integrationZaloResource.optional(),
    }),
  ),
  pageCount: z.number(),
})
export type ListInboxesResponse = z.infer<typeof listInboxesResponse>

export const publicListInboxesResponse = z.object({
  data: z.array(
    inboxResource.pick({
      id: true,
      name: true,
      channel: true,
      status: true,
    }),
  ),
  pageCount: z.number(),
})
export type PublicListInboxesResponse = z.infer<
  typeof publicListInboxesResponse
>
