import { db } from "@chatbotx.io/database/client"
import type {
  IntegrationType,
  OrganizationSettings,
} from "@chatbotx.io/database/partials"
import {
  integrationGoogleSheetsModel,
  integrationModel,
} from "@chatbotx.io/database/schema"
import type { AuthValue, Oauth2AuthValue } from "@chatbotx.io/sdk"
import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { notFound, redirect } from "next/navigation"
import type { NextRequest } from "next/server"
import { z } from "zod"
import { connectZaloHandler } from "@/features/integration-zalo/actions/connect-zalo.action"
import { findOrganization } from "@/features/organization/queries"
import { findChatbotOrFail } from "@/features/workspaces/queries"
import { type IntegrationKey, integrations } from "@/integration"
import { logger } from "@/lib/log"

const stateValidationSchema = z.object({
  workspaceId: zodBigintAsString(),
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
  const url = new URL(req.url)
  const rawState = JSON.parse(atob(url.searchParams.get("state") || ""))
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

  // find workspace and organization config
  const workspace = await findChatbotOrFail({ id: stateParams.workspaceId })
  const organization = await findOrganization({ id: workspace.organizationId })
  const organizationSettings =
    organization?.settings as unknown as OrganizationSettings

  let authResult: AuthValue
  let googleSheetsAuth: Oauth2AuthValue | null = null
  switch (integrationType) {
    case "zalo": {
      if (!organizationSettings.zalo) {
        return notFound()
      }

      await connectZaloHandler({
        zaloSettings: organizationSettings.zalo,
        workspaceId: stateParams.workspaceId,
        req,
      })

      return redirect(stateParams.referer)
    }

    case "googleSheets": {
      if (!organizationSettings.google) {
        return notFound()
      }

      logger.debug(req, "debug google sheets callback request")

      authResult = (await integrations.googleSheets.handleRequest?.({
        config: {
          ...organizationSettings.google,
          redirectUrl: new URL(
            "/integrations/google-sheets/callback",
            req.url,
          ).toString(),
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
      workspaceId: stateParams.workspaceId,
      integrationType,
    })

    if (integrationType === "googleSheets" && googleSheetsAuth) {
      await tx.insert(integrationGoogleSheetsModel).values({
        workspaceId: stateParams.workspaceId,
        integrationId,
        auth: googleSheetsAuth,
      })
    }
  })

  return redirect(stateParams.referer)
}
