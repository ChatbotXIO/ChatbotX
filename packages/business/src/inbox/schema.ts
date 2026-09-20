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
  includes: z
    .array(z.literal("integration"))
    .optional()
    .describe(
      'Relations to embed. Pass ["integration"] to include each inbox\'s channel integration.',
    ),
  page: z.coerce
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Page number, starting at 1."),
  perPage: z.coerce
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Number of items per page."),
})
export type ListInboxesRequest = z.infer<typeof listInboxesRequest>

export const inboxResource = createSelectSchema(inboxModel, {
  id: zodBigintAsString(),
  workspaceId: zodBigintAsString(),
})
export const inboxWithIntegrationsResource = inboxResource.extend({
  integrationWhatsapp: integrationWhatsappResource.nullish(),
  integrationWebchat: integrationWebchatResource.nullish(),
  integrationMessenger: integrationMessengerResource.nullish(),
  integrationZalo: integrationZaloResource.nullish(),
  integrationTelegram: integrationTelegramResource.nullish(),
  integrationInstagram: integrationInstagramResource.nullish(),
  integrationSmtp: integrationSmtpResource.nullish(),
})

export const listInboxesResponse = z.object({
  data: z.array(inboxWithIntegrationsResource),
  pageCount: z.number(),
})
export type ListInboxesResponse = z.infer<typeof listInboxesResponse>

/**
 * Unpaginated companion to `listInboxesRequest`. The paginated `list` is
 * capped at `maxLimit` (50) rows, which silently truncates a workspace with
 * more connected inboxes than that — so any client that needs the complete
 * set (e.g. the builder's inbox store, which the broadcast page picker reads
 * from) uses this instead. No `page`/`perPage`: the whole connected set is
 * always returned.
 */
export const listAllConnectedInboxesRequest = listInboxesRequest.pick({
  workspaceId: true,
  includes: true,
})
export type ListAllConnectedInboxesRequest = z.infer<
  typeof listAllConnectedInboxesRequest
>

export const listAllConnectedInboxesResponse = z.object({
  data: z.array(inboxWithIntegrationsResource),
})
export type ListAllConnectedInboxesResponse = z.infer<
  typeof listAllConnectedInboxesResponse
>
