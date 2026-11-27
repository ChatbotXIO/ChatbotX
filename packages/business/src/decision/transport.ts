import { readBodyWithLimit } from "@chatbotx.io/filesystem"
import ky from "ky"
import { fetch as undiciFetch } from "undici"
import { createPinnedDispatcher, toWebResponse } from "../net/pinned-fetch"
import { checkSsrfSafety } from "../net/ssrf-guard"

const DECISION_REQUEST_TIMEOUT_MS = 2500
const MAX_DECISION_RESPONSE_BYTES = 256 * 1024

type TransportResponse = {
  body: string
  status: number
}

const directEndpoint = "https://api.typesafe.ai/v1/systemone"
const openRouterEndpoint = "https://openrouter.ai/api/alpha/decisions"

const resolveProviderEndpoint = (input: {
  endpoint?: string | null
  providerKind: "systemOneCompatible" | "typesafe" | "openrouterDecision"
}): string | null => {
  if (input.providerKind === "typesafe") {
    return directEndpoint
  }
  if (input.providerKind === "openrouterDecision") {
    return openRouterEndpoint
  }

  return input.endpoint ?? null
}

/**
 * Posts JSON through a dispatcher whose connector dials only the already
 * validated public address. TLS still receives the original hostname.
 */
export const postDecisionRequest = async (input: {
  authorization: string
  body: object
  endpoint?: string | null
  providerKind: "systemOneCompatible" | "typesafe" | "openrouterDecision"
}): Promise<TransportResponse> => {
  const endpoint = resolveProviderEndpoint(input)
  if (!endpoint) {
    throw new Error("System One Compatible endpoint is missing")
  }

  const safety = await checkSsrfSafety(endpoint)
  if (safety.unsafe || safety.resolvedIps.length === 0) {
    throw new Error("Decision endpoint failed public-address validation")
  }

  const url = new URL(endpoint)
  const pinnedAddress = safety.resolvedIps[0]
  const dispatcher = createPinnedDispatcher(pinnedAddress, url.hostname)

  try {
    const client = ky.create({
      fetch: async (input, init) => {
        const request = new Request(input, init)
        const headers: Record<string, string> = {}
        request.headers.forEach((value, key) => {
          headers[key] = value
        })
        const response = await undiciFetch(request.url, {
          body: request.body
            ? Buffer.from(await request.arrayBuffer())
            : undefined,
          dispatcher,
          duplex: "half",
          headers,
          method: request.method,
          signal: request.signal,
        })

        return toWebResponse(response)
      },
      redirect: "manual",
      retry: 0,
      timeout: DECISION_REQUEST_TIMEOUT_MS,
      throwHttpErrors: false,
    })
    const response = await client.post(endpoint, {
      headers: {
        authorization: `Bearer ${input.authorization}`,
      },
      json: formatDecisionRequestBody(input),
    })

    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel().catch(() => undefined)
      throw new Error("Decision provider redirect was rejected")
    }
    const bytes = await readBodyWithLimit(
      response,
      MAX_DECISION_RESPONSE_BYTES,
      () => new Error("Decision provider response exceeded size limit"),
    )
    return { body: bytes.toString("utf8"), status: response.status }
  } finally {
    await dispatcher.close()
  }
}

export const formatDecisionRequestBody = (input: {
  body: object
  providerKind: "systemOneCompatible" | "typesafe" | "openrouterDecision"
}): object =>
  input.providerKind === "systemOneCompatible"
    ? input.body
    : toCriteriaDecisionRequest(input.body)

const toCriteriaDecisionRequest = (body: object): object => {
  const request = body as {
    questions?: Record<string, Record<string, unknown>>
  }
  return {
    ...request,
    questions: Object.fromEntries(
      Object.entries(request.questions ?? {}).map(([key, question]) => {
        if (question.type === "choice" && Array.isArray(question.options)) {
          return [
            key,
            {
              ...question,
              criteria: Object.fromEntries(
                question.options.map((option) => [
                  (option as { value: string }).value,
                  (option as { description?: string; label: string })
                    .description ?? (option as { label: string }).label,
                ]),
              ),
              options: undefined,
            },
          ]
        }
        if (question.type === "score" && Array.isArray(question.levels)) {
          return [
            key,
            {
              ...question,
              criteria: question.levels.map(
                (level) =>
                  (level as { description?: string; label: string })
                    .description ?? (level as { label: string }).label,
              ),
              levels: undefined,
            },
          ]
        }
        return [key, question]
      }),
    ),
  }
}
