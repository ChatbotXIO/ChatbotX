"use server"

import {
  integrationWebchatService,
  isWorkspaceScheduledForDeletion,
  workspaceService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { headers } from "next/headers"
import { getTranslations } from "next-intl/server"
import { z } from "zod"
import {
  checkGuestRateLimit,
  getGuestClientIp,
} from "@/lib/rate-limit/guest-rate-limit"
import { actionClient } from "@/lib/safe-action"
import { isOriginAuthorized } from "../lib/authorized-domain"
import {
  refreshWebchatAccessToken,
  verifyRefreshableWebchatAccessToken,
} from "../lib/webchat-access-token"

const refreshWebchatAccessTokenRequest = z.object({
  token: z.string().min(1),
  webchatId: zodBigintAsString(),
  workspaceId: zodBigintAsString(),
})

const getRequestHeaders = async () => {
  try {
    return await headers()
  } catch {
    return new Headers()
  }
}

type RefreshWebchatAccessTokenRequest = z.infer<
  typeof refreshWebchatAccessTokenRequest
>

export const handleRefreshWebchatAccessToken = async ({
  parsedInput,
}: {
  parsedInput: RefreshWebchatAccessTokenRequest
}) => {
  const t = await getTranslations("webchat")
  const refreshableToken =
    await verifyRefreshableWebchatAccessToken(parsedInput)
  if (!refreshableToken) {
    throw new ChatbotXException(
      t("unauthorizedDomain.description"),
      "forbidden",
      403,
    )
  }

  const workspace = await workspaceService.find({
    where: { id: parsedInput.workspaceId },
  })
  if (workspace && isWorkspaceScheduledForDeletion(workspace)) {
    throw new ChatbotXException(
      t("workspaceUnavailable"),
      "workspaceScheduledDeletion",
      403,
    )
  }

  const webchat = await integrationWebchatService.findByIdForWorkspaceOrNull({
    id: parsedInput.webchatId,
    workspaceId: parsedInput.workspaceId,
  })
  if (!webchat) {
    throw new ChatbotXException(
      t("unauthorizedDomain.description"),
      "forbidden",
      403,
    )
  }

  if (
    webchat.authorizedDomains.length > 0 &&
    !isOriginAuthorized(refreshableToken.originHost, webchat.authorizedDomains)
  ) {
    throw new ChatbotXException(
      t("unauthorizedDomain.description"),
      "forbidden",
      403,
    )
  }

  const requestHeaders = await getRequestHeaders()
  const rateLimit = await checkGuestRateLimit({
    clientIp: getGuestClientIp(requestHeaders),
    webchatId: webchat.id,
  })
  if (rateLimit.limited) {
    throw new ChatbotXException(
      t("rateLimitExceeded"),
      "rateLimitExceeded",
      429,
    )
  }

  const refreshedToken = await refreshWebchatAccessToken(parsedInput)
  if (!refreshedToken) {
    throw new ChatbotXException(
      t("unauthorizedDomain.description"),
      "forbidden",
      403,
    )
  }

  return {
    accessToken: refreshedToken.token,
    accessTokenExpiresAt: refreshedToken.expiresAt,
  }
}

export const refreshWebchatAccessTokenAction = actionClient
  .inputSchema(refreshWebchatAccessTokenRequest)
  .action(handleRefreshWebchatAccessToken)
