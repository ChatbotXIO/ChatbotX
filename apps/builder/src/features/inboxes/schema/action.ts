import { zodBigintAsString } from "@chatbotx.io/utils"
import { createSearchParamsCache, parseAsInteger } from "nuqs/server"
import { z } from "zod"
import { integrationInstagramResource } from "@/features/integration-instagram/schemas/resource"
import { integrationMessengerResource } from "@/features/integration-messenger/schema/resource"
import { integrationSmtpResource } from "@/features/integration-smtp/schemas/resource"
import { integrationTelegramResource } from "@/features/integration-telegram/schemas/resource"
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
      integrationWhatsapp: integrationWhatsappResource.nullish(),
      integrationWebchat: integrationWebchatResource.nullish(),
      integrationMessenger: integrationMessengerResource.nullish(),
      integrationZalo: integrationZaloResource.nullish(),
      integrationTelegram: integrationTelegramResource.nullish(),
      integrationInstagram: integrationInstagramResource.nullish(),
      integrationSmtp: integrationSmtpResource.nullish(),
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
