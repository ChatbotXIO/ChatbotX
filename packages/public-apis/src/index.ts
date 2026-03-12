import ky, { type Options } from "ky"

export type ChatbotXConfig = {
  apiKey: string
  apiUrl?: string
  allowSelfSignedCert?: boolean
}

const hasTlsSelfSignedCause = (error: unknown): boolean => {
  let current: unknown = error

  while (current && typeof current === "object") {
    const code =
      "code" in current && typeof current.code === "string"
        ? current.code
        : undefined

    if (code === "SELF_SIGNED_CERT_IN_CHAIN") {
      return true
    }

    current = "cause" in current ? current.cause : undefined
  }

  return false
}

export class ChatbotXAPI {
  private static hasWarnedInsecureTls = false
  private readonly apiKey: string
  private readonly apiUrl: string

  constructor(apiKey: string, apiUrl?: string, allowSelfSignedCert = true) {
    this.apiKey = apiKey
    this.apiUrl = apiUrl || "https://builder-dev.aha.chat/api/v1"

    if (allowSelfSignedCert) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"

      if (!ChatbotXAPI.hasWarnedInsecureTls) {
        process.stderr.write(
          "Warning: TLS certificate verification is disabled (CHATBOTX_ALLOW_SELF_SIGNED_CERT=true). Use only in local development.\n",
        )
        ChatbotXAPI.hasWarnedInsecureTls = true
      }
    }
  }

  async request<T = unknown>(
    endpoint: string,
    options: Options = {},
  ): Promise<T> {
    const url = `${this.apiUrl}${endpoint}`
    const headers = {
      "Content-Type": "application/json",
      "X-CHATBOT-TOKEN": this.apiKey,
      ...(options.headers ?? {}),
    }

    let response: Awaited<ReturnType<typeof ky>>

    try {
      response = await ky(url, {
        ...options,
        headers,
        throwHttpErrors: false,
      })
    } catch (error: unknown) {
      if (hasTlsSelfSignedCause(error)) {
        throw new Error(
          "TLS certificate validation failed (self-signed certificate in chain). Add your CA via NODE_EXTRA_CA_CERTS=/path/to/ca.pem, or for local dev only set CHATBOTX_ALLOW_SELF_SIGNED_CERT=true.",
        )
      }

      throw error
    }

    const contentType = response.headers.get("content-type") ?? ""
    const isJson = contentType.includes("application/json")
    const rawBody = await response.text()

    if (!response.ok) {
      throw new Error(`API Error (${response.status}): ${rawBody}`)
    }

    if (!rawBody) {
      return {} as T
    }

    if (isJson) {
      return JSON.parse(rawBody) as T
    }

    return { raw: rawBody } as T
  }
}
