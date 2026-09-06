import { workspaceService, zaloIntegrationService } from "@chatbotx.io/business"
import { auditService } from "@chatbotx.io/business/audit"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { ZaloCredential } from "@chatbotx.io/database/partials"
import type { ZaloAuthValue } from "@chatbotx.io/integration-zalo"
import { redirect } from "next/navigation"
import { integrations } from "@/integration"
import { getGuestClientIp } from "@/lib/rate-limit/guest-rate-limit"

export async function connectZaloHandler({
  zaloSettings,
  workspaceId,
  userId,
  req,
  redirectUrl,
}: {
  zaloSettings: ZaloCredential
  workspaceId: string
  userId: string
  req: Request
  redirectUrl: string
}) {
  const authValue = (await integrations.zalo.handleRequest({
    config: {
      ...zaloSettings,
      // Must match the redirect_uri used at authorize time — the tenant's
      // custom domain for a tenant-owned credential, else the broker. See
      // `libs/zalo.ts` and `oauth-referer.ts`.
      redirectUrl,
      stateParams: { workspaceId },
    },
    req,
  })) as ZaloAuthValue

  const { ownerId } = await workspaceService.findById({ id: workspaceId })

  let result: { integrationId: string | undefined; wasCreated: boolean }
  try {
    result = await zaloIntegrationService.connect({
      workspaceId,
      ownerId,
      oaId: authValue.oaId,
      name: authValue.metadata.oaName,
      auth: authValue,
    })
  } catch (error) {
    if (
      error instanceof ChatbotXException &&
      error.code === "channelDuplicated"
    ) {
      redirect(
        `/space/${workspaceId}/settings/channels?channel=zalo&error=duplicated`,
      )
    }
    throw error
  }

  if (result.wasCreated) {
    await auditService.record({
      userId,
      workspaceId,
      action: "connect",
      detail: `connected a new Zalo channel (#${result.integrationId})`,
      ipAddress: getGuestClientIp(req.headers),
      userAgent: req.headers.get("user-agent") ?? undefined,
    })
  }
}
