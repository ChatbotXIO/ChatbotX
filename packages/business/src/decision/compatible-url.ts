import { checkSsrfSafety } from "../net/ssrf-guard"
import { ChatbotXException } from "../errors"

/** Canonical Compatible endpoint: HTTPS, no query/fragment/userinfo. */
export const normalizeCompatibleEndpoint = async (
  rawEndpoint: string,
): Promise<string> => {
  let endpoint: URL
  try {
    endpoint = new URL(rawEndpoint.trim())
  } catch {
    throw new ChatbotXException(
      "Decision provider endpoint must be a valid HTTPS URL",
      "invalidDecisionEndpoint",
    )
  }

  if (
    endpoint.protocol !== "https:" ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash
  ) {
    throw new ChatbotXException(
      "Decision provider endpoint must be a canonical HTTPS URL",
      "invalidDecisionEndpoint",
    )
  }

  endpoint.pathname = endpoint.pathname.replace(/\/+$/, "") || "/"
  const normalized = endpoint.toString()
  const safety = await checkSsrfSafety(normalized)
  if (safety.unsafe) {
    throw new ChatbotXException(
      "Decision provider endpoint is not publicly reachable",
      "unsafeDecisionEndpoint",
    )
  }

  return normalized
}
