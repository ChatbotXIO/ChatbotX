import "server-only"

import {
  messengerIntegrationService,
  resolveMarketingMessagePageToken,
} from "@chatbotx.io/business"
import { facebookMarketingMessageAudienceService } from "@chatbotx.io/business/facebook-marketing-message-audience"
import type { WorkspaceModel } from "@chatbotx.io/database/types"
import { getMarketingMessagesAdAccounts } from "@chatbotx.io/integration-facebook-ads"
import { toAdAccountOption } from "./ad-account-option"
import { requireValidGrant } from "./grant"

/**
 * Reads shared by the builder's private oRPC handlers and the public API
 * (AGENTS.md invariant 23) — one implementation, two transports.
 */

export async function listMarketingMessagesPages(workspaceId: string) {
  const integrations =
    await messengerIntegrationService.findByWorkspaceId(workspaceId)
  return {
    pages: integrations.map((integration) => ({
      pageId: integration.pageId,
      name: integration.name,
    })),
  }
}

export async function listMarketingMessagesAdAccounts(
  workspace: WorkspaceModel,
) {
  const grant = await requireValidGrant(workspace)
  const accounts = await getMarketingMessagesAdAccounts(
    grant.accessToken,
    grant.version,
  )
  return { accounts: accounts.map(toAdAccountOption) }
}

export async function listMarketingMessagesAudiences(
  workspaceId: string,
  filter: { adAccountId?: string; pageId?: string; readyOnly?: boolean },
) {
  const rows = await facebookMarketingMessageAudienceService.list(
    workspaceId,
    filter,
  )
  return {
    audiences: rows.map((row) => ({
      id: row.id,
      customAudienceId: row.customAudienceId,
      adAccountId: row.adAccountId,
      pageId: row.pageId,
      name: row.name,
      description: row.description,
      rowsUploaded: row.rowsUploaded,
      readyAt: row.readyAt,
      createdAt: row.createdAt,
    })),
  }
}

export async function getMarketingMessagesAudiencesLiveStatus(
  workspace: WorkspaceModel,
) {
  const grant = await requireValidGrant(workspace)
  return {
    statuses: await facebookMarketingMessageAudienceService.getLiveStatus({
      workspaceId: workspace.id,
      grant,
      resolvePageToken: (pageId) =>
        resolveMarketingMessagePageToken({ workspaceId: workspace.id, pageId }),
    }),
  }
}
