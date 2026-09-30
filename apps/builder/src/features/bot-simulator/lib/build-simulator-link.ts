import { isOriginAuthorized } from "@/features/integration-webchat/lib/authorized-domain"

/**
 * The bot simulator only frames real web pages, so anything that is not an
 * absolute http(s) URL (e.g. `javascript:`) is rejected before it can reach
 * an iframe `src`.
 */
export function parseSimulatorWebsiteUrl(value: unknown): URL | null {
  if (typeof value !== "string" || value.trim() === "") {
    return null
  }
  try {
    const url = new URL(value.trim())
    return url.protocol === "http:" || url.protocol === "https:" ? url : null
  } catch {
    return null
  }
}

/**
 * A webchat with an allowed-domains list only renders the simulator for a
 * website on one of those domains (subdomains included). An empty list allows
 * any website, matching how the real embed treats it.
 */
export function isSimulatorWebsiteAllowed(
  websiteUrl: URL,
  authorizedDomains: string[],
): boolean {
  if (authorizedDomains.length === 0) {
    return true
  }
  return isOriginAuthorized(websiteUrl.origin, authorizedDomains)
}

export function buildBotSimulatorLink(input: {
  appUrl: string
  workspaceId: string
  webchatId: string
  websiteUrl: string
}): string {
  const link = new URL(
    `/bs/${input.workspaceId}/${input.webchatId}`,
    input.appUrl,
  )
  link.searchParams.set("url", input.websiteUrl.trim())
  return link.toString()
}
