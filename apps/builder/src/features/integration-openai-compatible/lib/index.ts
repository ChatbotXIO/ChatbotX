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
      ok: true
      warning: "could_not_verify"
      message: string
    }
> {
  const url = new URL(props.baseURL)
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
        message: error.message,
      }
    }
    return {
      ok: true,
      warning: "could_not_verify",
      message: error instanceof Error ? error.message : "Could not verify",
    }
  }
}
