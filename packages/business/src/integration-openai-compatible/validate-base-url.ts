import { ChatbotXException } from "../errors"
import { isCloud } from "../keys"
import { assertPublicUrl } from "../net"

const MAX_BASE_URL_LENGTH = 2048
const INVALID_BASE_URL_ERROR = "OpenAI-compatible base URL is invalid."
const BLOCKED_BASE_URL_ERROR = "OpenAI-compatible base URL is not allowed."

export const normalizeOpenaiCompatibleBaseUrl = (baseURL: string): string => {
  const trimmed = baseURL.trim()
  if (!trimmed || trimmed.length > MAX_BASE_URL_LENGTH) {
    throw new ChatbotXException(INVALID_BASE_URL_ERROR, "invalidBaseUrl", 400)
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new ChatbotXException(INVALID_BASE_URL_ERROR, "invalidBaseUrl", 400)
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ChatbotXException(INVALID_BASE_URL_ERROR, "invalidBaseUrl", 400)
  }

  return parsed.toString()
}

export const validateOpenaiCompatibleBaseUrlForEnvironment = async (
  baseURL: string,
): Promise<string> => {
  const normalizedBaseUrl = normalizeOpenaiCompatibleBaseUrl(baseURL)

  if (!isCloud()) {
    return normalizedBaseUrl
  }

  try {
    await assertPublicUrl(normalizedBaseUrl, "OpenAI-compatible base URL")
  } catch {
    throw new ChatbotXException(BLOCKED_BASE_URL_ERROR, "ssrfBlocked", 400)
  }

  return normalizedBaseUrl
}
