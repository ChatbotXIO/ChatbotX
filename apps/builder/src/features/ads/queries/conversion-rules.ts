import {
  type AdsConversionRuleResource,
  adsConversionRuleResource,
  adsConversionService,
  instagramIntegrationService,
  integrationWhatsappService,
  messengerIntegrationService,
} from "@chatbotx.io/business"
import { listAutomatedResponses } from "@/features/automated-response/queries"
import type { AutomatedResponseResource } from "@/features/automated-response/schema/resource"
import { messengerMessageTemplateService } from "@/features/integration-messenger/message-templates/queries"
import type { ListMessengerMessageTemplatesResponse } from "@/features/integration-messenger/message-templates/schema/query"
import { whatsappMessageTemplateService } from "@/features/integration-whatsapp/message-templates/queries"
import type { ListWhatsappMessageTemplatesResponse } from "@/features/integration-whatsapp/message-templates/schema/query"
import { listTags } from "@/features/tags/queries"
import type { TagResource } from "@/features/tags/schema/resource"

// Redacted to the fields ConversionEventsView actually reads (account id +
// display name). `integrationWhatsappService.listByWorkspaceId` returns the
// FULL row, including the encrypted `auth` and `capiAccessToken` columns —
// those must never be forwarded to a "use client" component's props.
export type ConversionEventsWhatsappIntegration = Pick<
  Awaited<
    ReturnType<typeof integrationWhatsappService.listByWorkspaceId>
  >[number],
  "id" | "name"
>

// Same redaction rationale as above — `messengerIntegrationService`/
// `instagramIntegrationService` rows carry encrypted `auth`.
export type ConversionEventsMessengerIntegration = Pick<
  Awaited<
    ReturnType<typeof messengerIntegrationService.findByWorkspaceId>
  >[number],
  "id" | "name"
>

// `instagramIntegrationService.findByWorkspaceId` (no `type` filter) returns
// BOTH IG packages — native Instagram login (`type: "instagram"`) and
// Instagram-via-Facebook-Page (`type: "facebook"`) — as one list, matching
// the single `integrationInstagramId` FK that backs both.
export type ConversionEventsInstagramIntegration = Pick<
  Awaited<
    ReturnType<typeof instagramIntegrationService.findByWorkspaceId>
  >[number],
  "id" | "name"
>

export type ConversionEventsData = {
  whatsappIntegrations: ConversionEventsWhatsappIntegration[]
  whatsappTemplates: ListWhatsappMessageTemplatesResponse
  messengerIntegrations: ConversionEventsMessengerIntegration[]
  messengerTemplates: ListMessengerMessageTemplatesResponse
  instagramIntegrations: ConversionEventsInstagramIntegration[]
  rules: AdsConversionRuleResource[]
  tags: TagResource[]
  automatedResponses: AutomatedResponseResource[]
}

// The rule trigger pickers reuse the existing tags/keywords list queries
// (no new API surface) — capped at the shared repository max page size since
// neither query supports an unbounded "all rows" fetch the way the WhatsApp
// template list does.
const RULE_PICKER_OPTIONS_LIMIT = 50

export async function getConversionEventsData(
  workspaceId: string,
): Promise<ConversionEventsData> {
  const [
    rawWhatsappIntegrations,
    whatsappTemplates,
    rawMessengerIntegrations,
    messengerTemplates,
    rawInstagramIntegrations,
    rules,
    tagsResult,
    automatedResponsesResult,
  ] = await Promise.all([
    integrationWhatsappService.listByWorkspaceId(workspaceId),
    whatsappMessageTemplateService.list({
      where: {
        workspaceId,
        status: "APPROVED",
      },
    }),
    messengerIntegrationService.findByWorkspaceId(workspaceId),
    messengerMessageTemplateService.list({
      where: {
        workspaceId,
        status: "APPROVED",
      },
    }),
    // No `type` filter: covers both native-login and via-Facebook-Page IG
    // integrations, matching the shared `integrationInstagramId` FK.
    instagramIntegrationService.findByWorkspaceId(workspaceId),
    // No `channel` filter: this view renders rule builders for all
    // ads-eligible channels (whatsapp/messenger/instagram), each filtering
    // this combined list by its own channel + integration id.
    adsConversionService.list({ workspaceId }),
    listTags({ workspaceId }),
    listAutomatedResponses({
      workspaceId,
      type: "inbound",
      folderId: null,
      page: 1,
      perPage: RULE_PICKER_OPTIONS_LIMIT,
      keyword: null,
      sort: [{ id: "createdAt", desc: true }],
    }),
  ])

  const whatsappIntegrations: ConversionEventsWhatsappIntegration[] =
    rawWhatsappIntegrations.map(({ id, name }) => ({ id, name }))
  const messengerIntegrations: ConversionEventsMessengerIntegration[] =
    rawMessengerIntegrations.map(({ id, name }) => ({ id, name }))
  const instagramIntegrations: ConversionEventsInstagramIntegration[] =
    rawInstagramIntegrations.map(({ id, name }) => ({ id, name }))

  return {
    whatsappIntegrations,
    whatsappTemplates,
    messengerIntegrations,
    messengerTemplates,
    instagramIntegrations,
    rules: rules.map((rule) => adsConversionRuleResource.parse(rule)),
    tags: tagsResult.data,
    automatedResponses: automatedResponsesResult.data,
  }
}
