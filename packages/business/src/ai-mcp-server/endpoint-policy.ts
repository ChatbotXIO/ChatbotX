import { ChatbotXException } from "../errors"
import { isCloud } from "../keys"
import { checkSsrfSafety } from "../net"

const blockedHostnames = new Set([
  "metadata.google.internal",
  "metadata.google.internal.",
])

function rejectEndpoint(): never {
  throw new ChatbotXException(
    "MCP server endpoint is not permitted.",
    "invalidMcpServerEndpoint",
    400,
  )
}

/**
 * Validates an MCP endpoint before a credential is resolved or a transport is
 * opened. Call this immediately before outbound traffic so persisted
 * endpoints are re-evaluated.
 *
 * Self-hosted editions only require an http(s) URL: the deployment owner is
 * the trust boundary, so internal/Docker MCP servers over plain HTTP stay
 * usable (mirrors `validateOpenaiCompatibleBaseUrlForEnvironment`). Cloud
 * additionally requires https and delegates address classification to the
 * shared SSRF guard, so MCP follows the same rules as webhooks and external
 * requests.
 */
export async function assertSafeMcpEndpoint(urlValue: string): Promise<void> {
  if (!URL.canParse(urlValue)) {
    rejectEndpoint()
  }

  const url = new URL(urlValue)
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    rejectEndpoint()
  }

  if (!isCloud()) {
    return
  }

  if (url.protocol !== "https:") {
    rejectEndpoint()
  }

  const hostname = url.hostname.toLowerCase()
  if (blockedHostnames.has(hostname) || hostname.endsWith(".localhost")) {
    rejectEndpoint()
  }

  // Fails closed: private, loopback and unresolvable targets all come back
  // as unsafe.
  const safety = await checkSsrfSafety(urlValue)
  if (safety.unsafe) {
    rejectEndpoint()
  }
}
