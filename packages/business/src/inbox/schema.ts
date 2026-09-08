import type { InboxStatus } from "@chatbotx.io/database/partials"
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

/**
 * Server-side input for `inboxService.list`, deliberately NOT part of
 * `listInboxesRequest`.
 *
 * `publishInboxesRequest` is `listInboxesRequest.omit({ workspaceId: true })`,
 * so anything added to that schema immediately becomes a documented parameter
 * of the public `/v1/inboxes` and `/v1/channels` endpoints. `statuses` is an
 * internal rendering concern, so it rides alongside the schema instead: every
 * oRPC handler passes only the zod-parsed request and therefore keeps the
 * connected-only default, while a server component that needs the wider list
 * asks for it explicitly.
 */
export type ListInboxesInput = ListInboxesRequest & {
  /**
   * Inbox statuses to include. Omitted means `["connected"]` — the
   * long-standing behaviour every existing caller relies on.
   */
  statuses?: readonly InboxStatus[]
}

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
