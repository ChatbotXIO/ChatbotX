import {
  type AdsConversionRuleResource,
  adsConversionRuleResource,
  adsConversionService,
  integrationWhatsappService,
} from "@chatbotx.io/business"
import { listAutomatedResponses } from "@/features/automated-response/queries"
import type { AutomatedResponseResource } from "@/features/automated-response/schema/resource"
import { whatsappMessageTemplateService } from "@/features/integration-whatsapp/message-templates/queries"
import type { ListWhatsappMessageTemplatesResponse } from "@/features/integration-whatsapp/message-templates/schema/query"
import { listTags } from "@/features/tags/queries"
import type { TagResource } from "@/features/tags/schema/resource"

export type ConversionEventsWhatsappIntegration = Awaited<
  ReturnType<typeof integrationWhatsappService.listByWorkspaceId>
>[number]

export type ConversionEventsData = {
  whatsappIntegrations: ConversionEventsWhatsappIntegration[]
  whatsappTemplates: ListWhatsappMessageTemplatesResponse
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
    whatsappIntegrations,
    whatsappTemplates,
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
    adsConversionService.list({
      workspaceId,
      channel: "whatsapp",
    }),
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

  return {
    whatsappIntegrations,
    whatsappTemplates,
    rules: rules.map((rule) => adsConversionRuleResource.parse(rule)),
    tags: tagsResult.data,
    automatedResponses: automatedResponsesResult.data,
  }
}
