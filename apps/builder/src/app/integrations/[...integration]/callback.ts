import { organizationService } from "@chatbotx.io/business"
import { db } from "@chatbotx.io/database/client"
import type { IntegrationType } from "@chatbotx.io/database/partials"
import {
  integrationGoogleSheetsModel,
  integrationModel,
} from "@chatbotx.io/database/schema"
import {
  type AuthValue,
  getPublicUrlFromRequest,
  type Oauth2AuthValue,
} from "@chatbotx.io/sdk"
import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { notFound, redirect } from "next/navigation"
import type { NextRequest } from "next/server"
import { z } from "zod"
import { connectZaloHandler } from "@/features/integration-zalo/actions/connect-zalo.action"

import { workspaceService } from "@/features/workspaces/workspace-service"
import { type IntegrationKey, integrations } from "@/integration"
import { getCurrentUserId } from "@/lib/auth/utils"
import { logger } from "@/lib/log"

const stateValidationSchema = z.object({
  workspaceId: zodBigintAsString().optional(),
  referer: z.url(),
})

export const handleCallback = async (
  integrationType: IntegrationType,
  req: NextRequest,
) => {
  if (!(integrationType in integrations)) {
    return notFound()
  }

  // Parse state params to get workspace info
  const url = new URL(getPublicUrlFromRequest(req))
  const rawState = JSON.parse(
    atob(decodeURIComponent(url.searchParams.get("state") || "")),
  )
  const { data: stateParams } = stateValidationSchema.safeParse(rawState)
  if (!stateParams) {
    logger.debug(url, "state is not valid")
    return notFound()
  }

  const targetIntegration = integrations[integrationType as IntegrationKey]

  if (!(targetIntegration && "handleRequest" in targetIntegration)) {
    logger.debug(`${integrationType} is missing handleRequest method`)
    return notFound()
  }

  // find organization from domain and current user
  const organization = await organizationService.findByDomain(url.hostname)
  const organizationSettings = organization.settings

  const userId = await getCurrentUserId()
  if (!userId) {
    return notFound()
  }

  const workspace = stateParams.workspaceId
    ? await workspaceService.findById(stateParams.workspaceId)
    : await workspaceService.create({
        data: {
          organizationId: organization.id,
          name: "New Workspace",
        },
        organization,
        createdBy: userId,
      })

  let authResult: AuthValue
  let googleSheetsAuth: Oauth2AuthValue | null = null
  switch (integrationType) {
    case "zalo": {
      if (!organizationSettings.zalo) {
        return notFound()
      }

      await connectZaloHandler({
        zaloSettings: organizationSettings.zalo,
        workspaceId: workspace.id,
        req,
      })

      return redirect(stateParams.referer)
    }

    case "googleSheets": {
      if (!organizationSettings.google) {
        return notFound()
      }

      const callbackUrl = new URL(
        "/integrations/google-sheets/callback",
        url,
      ).toString()
      logger.debug({ callbackUrl }, "debug google sheets callback request")

      authResult = (await integrations.googleSheets.handleRequest?.({
        config: {
          ...organizationSettings.google,
          redirectUrl: callbackUrl,
        },
        req,
      })) as unknown as Oauth2AuthValue
      googleSheetsAuth = authResult
      break
    }

    default:
      return notFound()
  }

  if (!authResult) {
    return notFound()
  }

  await db.transaction(async (tx) => {
    const integrationId = createId()

    await tx.insert(integrationModel).values({
      id: integrationId,
      workspaceId: workspace.id,
      integrationType,
    })

    if (integrationType === "googleSheets" && googleSheetsAuth) {
      await tx.insert(integrationGoogleSheetsModel).values({
        workspaceId: workspace.id,
        integrationId,
        auth: googleSheetsAuth,
      })
    }
  })

  return redirect(stateParams.referer)
}
