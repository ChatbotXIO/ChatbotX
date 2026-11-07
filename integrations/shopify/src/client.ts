import ky from "ky"
import { z } from "zod"
import {
  SHOPIFY_HTTP_TIMEOUT_MS,
  shopifyAccessTokenUrl,
  shopifyGraphqlUrl,
} from "./constants"
import { ShopifyApiError, ShopifyUserError } from "./error"

/** What every Admin API call needs: the store and a working access token. */
export type ShopifyCredentials = {
  shopDomain: string
  accessToken: string
}

const parseRetryAfter = (value: string | null): number | undefined => {
  if (!value) {
    return
  }
  const seconds = Number.parseFloat(value)
  return Number.isFinite(seconds) && seconds >= 0
    ? Math.ceil(seconds)
    : undefined
}

const graphqlErrorSchema = z.object({
  message: z.string(),
  extensions: z.object({ code: z.string().optional() }).loose().optional(),
})

const graphqlResponseSchema = z.object({
  data: z.unknown().optional(),
  errors: z.array(graphqlErrorSchema).optional(),
})

const restErrorMessage = (payload: unknown): string | undefined => {
  if (payload && typeof payload === "object" && "errors" in payload) {
    const errors = (payload as { errors: unknown }).errors
    return typeof errors === "string" ? errors : JSON.stringify(errors)
  }
  return
}

/**
 * Runs one Admin GraphQL operation and parses `data` with `schema`. A
 * throttled query is a 429 with the bucket's refill time, so the caller's
 * job retries later instead of hammering the store.
 */
export async function shopifyGraphql<T>(
  credentials: ShopifyCredentials,
  query: string,
  variables: Record<string, unknown>,
  schema: z.ZodType<T>,
): Promise<T> {
  const response = await ky.post(shopifyGraphqlUrl(credentials.shopDomain), {
    json: { query, variables },
    headers: {
      Accept: "application/json",
      "X-Shopify-Access-Token": credentials.accessToken,
    },
    retry: 0,
    throwHttpErrors: false,
    timeout: SHOPIFY_HTTP_TIMEOUT_MS,
  })
  const payload: unknown = await response.json().catch(() => undefined)

  if (!response.ok) {
    throw new ShopifyApiError({
      message:
        restErrorMessage(payload) ??
        `Shopify Admin API returned ${response.status}`,
      statusCode: response.status,
      retryAfterSeconds: parseRetryAfter(response.headers.get("Retry-After")),
    })
  }

  const parsed = graphqlResponseSchema.parse(payload)
  if (parsed.errors?.length) {
    const throttled = parsed.errors.some(
      (error) => error.extensions?.code === "THROTTLED",
    )
    const denied = parsed.errors.some(
      (error) => error.extensions?.code === "ACCESS_DENIED",
    )
    let statusCode = 400
    if (throttled) {
      statusCode = 429
    } else if (denied) {
      statusCode = 403
    }
    throw new ShopifyApiError({
      message: parsed.errors.map((error) => error.message).join("; "),
      statusCode,
      retryAfterSeconds: throttled ? 2 : undefined,
    })
  }
  return schema.parse(parsed.data)
}

/** Throws when a mutation answered with `userErrors`. */
export const assertNoUserErrors = (
  userErrors: Array<{ field?: string[] | null; message: string }>,
) => {
  if (userErrors.length > 0) {
    throw new ShopifyUserError(userErrors)
  }
}

const accessTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  scope: z.string().optional(),
  expires_in: z.number().optional(),
})

/**
 * Exchanges a Dev Dashboard app's Client ID and Client Secret for an access
 * token (the client credentials grant). The token lasts `expiresIn` seconds,
 * about 24 hours, and is requested again once it runs out.
 */
export async function requestShopifyAccessToken(input: {
  shopDomain: string
  clientId: string
  clientSecret: string
}): Promise<{ accessToken: string; scope: string; expiresIn: number }> {
  const response = await ky.post(shopifyAccessTokenUrl(input.shopDomain), {
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: input.clientId,
      client_secret: input.clientSecret,
    }),
    headers: { Accept: "application/json" },
    retry: 0,
    throwHttpErrors: false,
    timeout: SHOPIFY_HTTP_TIMEOUT_MS,
  })
  const payload: unknown = await response.json().catch(() => undefined)
  if (!response.ok) {
    throw new ShopifyApiError({
      message:
        restErrorMessage(payload) ??
        `Shopify refused the client credentials (${response.status})`,
      // A bad ID or secret answers 400; treat it as an auth failure.
      statusCode: response.status === 400 ? 401 : response.status,
    })
  }
  const parsed = accessTokenResponseSchema.parse(payload)
  return {
    accessToken: parsed.access_token,
    scope: parsed.scope ?? "",
    expiresIn: parsed.expires_in ?? 86_400,
  }
}
