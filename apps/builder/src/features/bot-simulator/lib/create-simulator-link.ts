import {
  integrationWebchatService,
  resolveTenantSettings,
} from "@chatbotx.io/business"
import { validationException } from "@chatbotx.io/business/errors"
import {
  buildBotSimulatorLink,
  isSimulatorWebsiteAllowed,
  parseSimulatorWebsiteUrl,
} from "./build-simulator-link"

/**
 * Server-side twin of the bot simulator form's "Get link": the same checks
 * the `/bs` page enforces before rendering (website is http(s), webchat is
 * enabled, website is on one of its allowed domains), so a link handed out
 * here never opens onto a 404. The host is the tenant's app URL, not the
 * request's, so a white-label workspace gets a link on its own domain.
 */
export async function createBotSimulatorLink(input: {
  workspaceId: string
  webchatId: string
  websiteUrl: string
}): Promise<string> {
  const websiteUrl = parseSimulatorWebsiteUrl(input.websiteUrl)
  if (!websiteUrl) {
    throw validationException(
      "websiteUrl",
      "Website URL must be an absolute http(s) URL",
    )
  }

  const webchat = await integrationWebchatService.findByIdForWorkspace({
    id: input.webchatId,
    workspaceId: input.workspaceId,
  })
  if (!webchat.enable) {
    throw validationException("webchatId", "Webchat is disabled")
  }
  if (!isSimulatorWebsiteAllowed(websiteUrl, webchat.authorizedDomains)) {
    throw validationException(
      "websiteUrl",
      `Website is not on the webchat's allowed domains: ${webchat.authorizedDomains.join(", ")}`,
    )
  }

  const { appUrl } = await resolveTenantSettings({
    workspaceId: input.workspaceId,
  })
  return buildBotSimulatorLink({
    appUrl,
    workspaceId: input.workspaceId,
    webchatId: webchat.id,
    websiteUrl: websiteUrl.toString(),
  })
}
