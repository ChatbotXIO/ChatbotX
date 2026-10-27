"use server"

import {
  integrationWebchatService,
  isWorkspaceScheduledForDeletion,
  workspaceService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { z } from "zod"
import {
  checkGuestRateLimit,
  getGuestClientIp,
  getGuestRequestHeaders,
} from "@/lib/rate-limit/guest-rate-limit"
import { actionClient } from "@/lib/safe-action"
import {
  isTokenOriginAllowed,
  refreshWebchatAccessToken,
  verifyRefreshableWebchatAccessToken,
} from "../lib/webchat-access-token"

const refreshWebchatAccessTokenRequest = z.object({
  token: z.string().min(1),
  webchatId: zodBigintAsString(),
  workspaceId: zodBigintAsString(),
})

type RefreshWebchatAccessTokenRequest = z.infer<
  typeof refreshWebchatAccessTokenRequest
>

export const handleRefreshWebchatAccessToken = async ({
  parsedInput,
}: {
  parsedInput: RefreshWebchatAccessTokenRequest
}) => {
  const forbidden = (description: string) =>
    new ChatbotXException(description, "forbidden", 403)

  const t = await getTranslations("webchat")

  const refreshableToken =
    await verifyRefreshableWebchatAccessToken(parsedInput)
  if (!refreshableToken) {
    throw forbidden(t("unauthorizedDomain.description"))
  }

  const requestHeaders = await getGuestRequestHeaders()
  const rateLimit = await checkGuestRateLimit({
    clientIp: getGuestClientIp(requestHeaders),
    webchatId: parsedInput.webchatId,
  })
  if (rateLimit.limited) {
    throw new ChatbotXException(
      t("rateLimitExceeded"),
      "rateLimitExceeded",
      429,
    )
  }

  const [workspace, webchat] = await Promise.all([
    workspaceService.find({
      where: { id: parsedInput.workspaceId },
    }),
    integrationWebchatService.findByIdForWorkspaceOrNull({
      id: parsedInput.webchatId,
      workspaceId: parsedInput.workspaceId,
    }),
  ])

  if (workspace && isWorkspaceScheduledForDeletion(workspace)) {
    throw new ChatbotXException(
      t("workspaceUnavailable"),
      "workspaceScheduledDeletion",
      403,
    )
  }
  if (!webchat) {
    throw forbidden(t("unauthorizedDomain.description"))
  }
  if (
    !isTokenOriginAllowed(
      refreshableToken.originHost,
      webchat.authorizedDomains,
    )
  ) {
    throw forbidden(t("unauthorizedDomain.description"))
  }

  const refreshedToken = await refreshWebchatAccessToken(refreshableToken)
  return {
    accessToken: refreshedToken.token,
    accessTokenExpiresAt: refreshedToken.expiresAt,
  }
}

export const refreshWebchatAccessTokenAction = actionClient
  .inputSchema(refreshWebchatAccessTokenRequest)
  .action(handleRefreshWebchatAccessToken)
