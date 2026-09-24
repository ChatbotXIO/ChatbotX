import { tiktokIntegrationService } from "@chatbotx.io/business"
import type { IntegrationTiktokModel } from "@chatbotx.io/database/types"
import {
  type TiktokAuthValue,
  tiktokNeedsReauthorization,
} from "@chatbotx.io/integration-tiktok"
import type { IntegrationTiktokResource } from "../schema/resource"

/**
 * Projects a stored row onto the shape the settings table renders.
 *
 * The row is NOT safe to hand to a client component as-is: `auth` holds the app
 * client secret, the access token and the refresh token, and a promise prop
 * crossing into `"use client"` is serialized into the RSC payload the browser
 * receives. Everything derived from `auth` — here, whether the connection still
 * needs to go through the authorize flow — is resolved on this side.
 */
const toResource = (
  integration: IntegrationTiktokModel,
): IntegrationTiktokResource => ({
  id: integration.id,
  inboxId: integration.inboxId,
  name: integration.name,
  openId: integration.openId,
  tokenRefreshError: integration.tokenRefreshError,
  needsReauthorization: tiktokNeedsReauthorization(
    integration.auth as TiktokAuthValue,
  ),
  commentToMessageStatus:
    (integration.auth as TiktokAuthValue).metadata?.commentToMessage?.status ??
    null,
})

export const listIntegrationTiktoks = async ({
  where,
}: {
  where: Partial<Pick<IntegrationTiktokModel, "workspaceId">>
}): Promise<{ data: IntegrationTiktokResource[] }> => {
  const data = await tiktokIntegrationService.listByWorkspace(where)
  return { data: data.map(toResource) }
}

/** Internal lookup by openId — no auth check, for use in webhook handler only */
export const findIntegrationTiktokByOpenId = async ({
  openId,
}: {
  openId: string
}): Promise<IntegrationTiktokModel | null> =>
  await tiktokIntegrationService.findByOpenId(openId)
