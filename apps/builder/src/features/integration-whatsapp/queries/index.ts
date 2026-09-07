import type { IntegrationWhatsappResource } from "@chatbotx.io/business"
import { integrationWhatsappService } from "@chatbotx.io/business"
import { integrationWhatsappRepository } from "@chatbotx.io/database/repositories"
import type {
  InboxModel,
  IntegrationWhatsappModel,
} from "@chatbotx.io/database/types"
import type { WhatsappAuthValue } from "@chatbotx.io/integration-whatsapp"
import type { PaginatedResponse } from "@/features/common/schema/pagination"

type IntegrationWhatsappWithInbox = IntegrationWhatsappResource & {
  inbox?: Pick<InboxModel, "id" | "name">
}

export const listIntegrationWhatsapps = async (
  props: Pick<IntegrationWhatsappModel, "workspaceId">,
): Promise<PaginatedResponse<IntegrationWhatsappWithInbox>> => {
  const data =
    await integrationWhatsappRepository.listClientSafeByWorkspaceId(props)

  return { data, pageCount: 1 }
}

// Returns the FULL row, including the encrypted `auth` and `capiAccessToken`
// columns: several whatsapps/[id]/* server pages legitimately need the real
// `auth` token to call Meta APIs server-side (account-healths, automation,
// ecommerce, useful-links). Never forward this value directly as a prop to a
// "use client" component — pick only the non-secret fields you need first
// (see `IntegrationWhatsappLinkable` / `toIntegrationWhatsappLinkable` below).
export const findIntegrationWhatsapp = async (
  props: Pick<IntegrationWhatsappModel, "workspaceId" | "id">,
): Promise<IntegrationWhatsappModel> => {
  const integration =
    await integrationWhatsappService.findByIdForWorkspace(props)

  if (!integration) {
    throw new Error("Whatsapp integration not found")
  }

  return integration
}

// Safe, non-secret subset of IntegrationWhatsappModel for client components
// that only need to build Meta "manage" deep links / identify the
// integration (e.g. WhatsappAutomationManage, WhatsappFlowsTable,
// WhatsappMessageTemplatesTable). Never add `auth` or `capiAccessToken` here.
export type IntegrationWhatsappLinkable = Pick<
  IntegrationWhatsappModel,
  "id" | "workspaceId" | "businessId" | "wabaId"
>

export const toIntegrationWhatsappLinkable = (
  integration: IntegrationWhatsappModel,
): IntegrationWhatsappLinkable => ({
  id: integration.id,
  workspaceId: integration.workspaceId,
  businessId: integration.businessId,
  wabaId: integration.wabaId,
})

export const findIntegrationWhatsappById = async (
  id: IntegrationWhatsappModel["id"],
): Promise<IntegrationWhatsappModel | null> =>
  await integrationWhatsappRepository.findById({ id })

export const markWhatsappWebhookVerified = async (
  id: IntegrationWhatsappModel["id"],
  current: WhatsappAuthValue,
): Promise<void> => {
  await integrationWhatsappService.markWebhookVerified({
    id,
    auth: current,
  })
}
