import { createSelectSchema, inboxModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { integrationInstagramResource } from "../integration-instagram/schema"
import { integrationMessengerResource } from "../integration-messenger/schema"
import { integrationSmtpResource } from "../integration-smtp/schema"
import { integrationTelegramResource } from "../integration-telegram/schema"
import { integrationWebchatResource } from "../integration-webchat/schema"
import { integrationWhatsappResource } from "../integration-whatsapp/schema"
import { integrationZaloResource } from "../integration-zalo/schema"

export const listInboxesRequest = z.object({
  workspaceId: zodBigintAsString(),
  includes: z.array(z.literal("integration")).optional(),
  page: z.coerce.number().int().min(1).optional(),
  perPage: z.coerce.number().int().min(1).optional(),
})
export type ListInboxesRequest = z.infer<typeof listInboxesRequest>

export const inboxResource = createSelectSchema(inboxModel, {
  id: zodBigintAsString(),
  workspaceId: zodBigintAsString(),
})
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
