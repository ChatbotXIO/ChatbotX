import { validateOpenaiCompatibleBaseUrlForEnvironment } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import ky, { HTTPError } from "ky"

const VERIFY_TIMEOUT_MS = 10_000
const UNAUTHORIZED_STATUSES = new Set([401, 403])
const TRAILING_SLASH_REGEX = /\/$/

export async function verifyOpenaiCompatibleProvider(props: {
  apiKey?: string
  baseURL: string
}): Promise<
  | { ok: true }
  | {
      ok: false
      reason: "unauthorized"
      status: number
    }
  | {
      ok: false
      reason: "unsafe_base_url"
    }
  | {
      ok: true
      warning: "could_not_verify"
      message: string
    }
> {
  let normalizedBaseUrl: string
  try {
    normalizedBaseUrl = await validateOpenaiCompatibleBaseUrlForEnvironment(
      props.baseURL,
    )
  } catch (error) {
    if (
      error instanceof ChatbotXException &&
      (error.code === "invalidBaseUrl" || error.code === "ssrfBlocked")
    ) {
      return { ok: false, reason: "unsafe_base_url" }
    }
    throw error
  }

  const url = new URL(normalizedBaseUrl)
  url.pathname = `${url.pathname.replace(TRAILING_SLASH_REGEX, "")}/models`

  try {
    await ky.get(url, {
      headers: props.apiKey
        ? { Authorization: `Bearer ${props.apiKey}` }
        : undefined,
      timeout: VERIFY_TIMEOUT_MS,
      retry: 0,
    })
    return { ok: true }
  } catch (error) {
    if (error instanceof HTTPError) {
      if (UNAUTHORIZED_STATUSES.has(error.response.status)) {
        return {
          ok: false,
          reason: "unauthorized",
          status: error.response.status,
        }
      }
      return {
        ok: true,
        warning: "could_not_verify",
        message: "Could not verify provider",
      }
    }
    return {
      ok: true,
      warning: "could_not_verify",
      message: "Could not verify provider",
    }
  }
}
