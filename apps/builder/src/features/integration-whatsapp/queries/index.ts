import type { IntegrationWhatsappResource } from "@chatbotx.io/business"
import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { integrationWhatsappRepository } from "@chatbotx.io/database/repositories"
import { integrationWhatsappModel } from "@chatbotx.io/database/schema"
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
  const integrations =
    await integrationWhatsappRepository.listClientResourcesByWorkspaceId(
      props.workspaceId,
    )
  const data: IntegrationWhatsappWithInbox[] = integrations.map(
    ({ inbox, ...integration }) => ({
      ...integration,
      inbox: inbox ?? undefined,
    }),
  )

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
): Promise<IntegrationWhatsappModel> =>
  await findOrFail({
    table: integrationWhatsappModel,
    where: props,
    message: "Whatsapp integration not found",
  })

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
): Promise<IntegrationWhatsappModel | null> => {
  const integration = await db.query.integrationWhatsappModel.findFirst({
    where: { id },
  })

  return integration ?? null
}

export const markWhatsappWebhookVerified = async (
  id: IntegrationWhatsappModel["id"],
  current: WhatsappAuthValue,
): Promise<void> => {
  const updatedAuth: WhatsappAuthValue = {
    ...current,
    metadata: {
      ...current.metadata,
      webhookVerifiedAt: new Date().toISOString(),
    },
  }

  await db
    .update(integrationWhatsappModel)
    .set({ auth: updatedAuth })
    .where(eq(integrationWhatsappModel.id, id))
}
