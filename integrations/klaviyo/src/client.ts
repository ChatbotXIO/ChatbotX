import { SdkException } from "@aha.chat/sdk"
import ky, { HTTPError, type Options } from "ky"
import { z } from "zod"
import type {
  KlaviyoAuthValue,
  KlaviyoField,
  KlaviyoList,
  KlaviyoTag,
} from "./schemas"

const LEADING_SLASH_REGEX = /^\//
const NON_DIGIT_REGEX = /\D/g
const E164_REGEX = /^\+[1-9]\d{1,14}$/
const VN_LOCAL_PHONE_REGEX = /^0\d{9,10}$/

const klaviyoErrorResponseSchema = z
  .object({
    errors: z
      .array(
        z
          .object({
            detail: z.string().optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough()

class KlaviyoRequestError extends SdkException {
  readonly status: number
  readonly endpoint: string
  readonly method: string
  readonly details: string[]

  constructor(props: {
    status: number
    endpoint: string
    method: string
    message: string
    details: string[]
  }) {
    super(props.message)
    this.status = props.status
    this.endpoint = props.endpoint
    this.method = props.method
    this.details = props.details
  }
}

const getMethod = (options: Options): string => {
  const method = options.method
  if (typeof method === "string" && method.trim()) {
    return method.toUpperCase()
  }
  return "GET"
}

const normalizeRawPhone = (phone: string): string => {
  const trimmed = phone.trim()
  if (!trimmed) {
    return ""
  }

  // keep leading "+" if present, strip the rest to digits
  const hasPlus = trimmed.startsWith("+")
  const digitsOnly = trimmed.replaceAll(NON_DIGIT_REGEX, "")
  if (!digitsOnly) {
    return ""
  }

  if (trimmed.startsWith("00")) {
    return `+${digitsOnly.slice(2)}`
  }

  return hasPlus ? `+${digitsOnly}` : digitsOnly
}

const toE164Candidate = (rawPhone: string): string | null => {
  const normalized = normalizeRawPhone(rawPhone)
  if (!normalized) {
    return null
  }

  // If already has +, assume caller provided country code
  if (normalized.startsWith("+")) {
    return normalized
  }

  // VN fallback: 0xxxxxxxxx or 0xxxxxxxxxx -> +84xxxxxxxxx(x)
  if (VN_LOCAL_PHONE_REGEX.test(normalized)) {
    return `+84${normalized.slice(1)}`
  }

  // Otherwise, treat as missing "+" but already includes country code
  return `+${normalized}`
}

const isValidE164 = (phone: string): boolean => E164_REGEX.test(phone)

export class KlaviyoClient {
  private readonly auth: KlaviyoAuthValue
  private readonly baseUrl = "https://a.klaviyo.com/api"
  private readonly revision = "2024-10-15"

  constructor(auth: KlaviyoAuthValue) {
    this.auth = auth
  }

  private async request<T>(
    endpoint: string,
    options: Options = {},
  ): Promise<T> {
    const cleanEndpoint = endpoint.replace(LEADING_SLASH_REGEX, "")
    const url = `${this.baseUrl}/${cleanEndpoint}`

    try {
      return await ky(url, {
        ...options,
        headers: {
          Authorization: `Klaviyo-API-Key ${this.auth.apiKey}`,
          Accept: "application/json",
          "Content-Type": "application/json",
          revision: this.revision,
          ...options.headers,
        },
      }).json<T>()
    } catch (error) {
      if (error instanceof HTTPError) {
        const raw = await error.response.json().catch(() => ({}))
        const parsed = klaviyoErrorResponseSchema.safeParse(raw)
        const details = parsed.success
          ? (parsed.data.errors || [])
              .map((e) => e.detail)
              .filter((d): d is string => typeof d === "string" && d.length > 0)
          : []

        const message = details[0] || error.message
        throw new KlaviyoRequestError({
          status: error.response.status,
          endpoint: cleanEndpoint,
          method: getMethod(options),
          message: `Klaviyo API Error (${error.response.status}) [${getMethod(options)} ${cleanEndpoint}]: ${message}`,
          details,
        })
      }
      throw error
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      // Documentation: GET /api/accounts
      await this.request("accounts", { method: "GET" })
      return true
    } catch (_error) {
      return false
    }
  }

  async getLists(): Promise<KlaviyoList[]> {
    try {
      const response = await this.request<{
        data: Array<{ id: string; attributes: { name: string } }>
      }>("lists", { method: "GET" })

      return (
        response.data?.map((item) => ({
          id: item.id,
          name: item.attributes.name,
        })) || []
      )
    } catch (error) {
      if (error instanceof SdkException) {
        throw error
      }
      throw new SdkException(`Failed to get lists: ${error}`)
    }
  }

  async getTags(): Promise<KlaviyoTag[]> {
    try {
      const response = await this.request<{
        data: Array<{ id: string; attributes: { name: string } }>
      }>("tags", { method: "GET" })

      return (
        response.data?.map((item) => ({
          id: item.id,
          name: item.attributes.name,
        })) || []
      )
    } catch (error) {
      if (error instanceof SdkException) {
        throw error
      }
      throw new SdkException(`Failed to get tags: ${error}`)
    }
  }

  getFields(): Promise<KlaviyoField[]> {
    // Klaviyo doesn't have a specific "get custom fields" endpoint like Drip,
    // but we can return some standard ones or let users define them.
    // For now, return a basic list or empty if not supported.
    return Promise.resolve([])
  }

  async syncProfile(props: {
    email: string
    phone?: string
    firstName?: string
    lastName?: string
    title?: string
    organization?: string
    listId?: string
    tags?: string[]
    customFields?: Record<string, unknown>
  }): Promise<{ id: string; email: string }> {
    const attributes: Record<string, unknown> = {
      email: props.email,
    }

    const rawPhone = props.phone?.trim() || ""
    const phoneCandidate = rawPhone ? toE164Candidate(rawPhone) : null
    const validPhoneNumber =
      phoneCandidate && isValidE164(phoneCandidate) ? phoneCandidate : null

    if (props.firstName) {
      attributes.first_name = props.firstName
    }
    if (props.lastName) {
      attributes.last_name = props.lastName
    }
    if (validPhoneNumber) {
      attributes.phone_number = validPhoneNumber
    }
    if (props.title) {
      attributes.title = props.title
    }
    if (props.organization) {
      attributes.organization = props.organization
    }

    const properties: Record<string, unknown> = {
      ...(props.customFields || {}),
    }
    if (rawPhone) {
      properties.raw_phone = rawPhone
    }
    if (Object.keys(properties).length > 0) {
      attributes.properties = properties
    }

    const upsertProfile = async (): Promise<{ id: string; email: string }> => {
      // Use profile-import for synchronous upsert
      const response = await this.request<{
        data: { id: string; attributes: { email: string } }
      }>("profile-import/", {
        method: "POST",
        json: {
          data: {
            type: "profile",
            attributes,
          },
        },
      })

      return { id: response.data.id, email: response.data.attributes.email }
    }

    const addToListIfNeeded = async (profileId: string): Promise<void> => {
      if (!props.listId) {
        return
      }

      try {
        await this.request(`lists/${props.listId}/relationships/profiles`, {
          method: "POST",
          json: {
            data: [{ type: "profile", id: profileId }],
          },
        })
      } catch (error) {
        if (
          error instanceof KlaviyoRequestError &&
          (error.details.join(" ").toLowerCase().includes("already") ||
            error.details.join(" ").toLowerCase().includes("exists"))
        ) {
          return
        }
        throw error
      }
    }

    const addTagsIfNeeded = async (profileId: string): Promise<void> => {
      if (!props.tags || props.tags.length === 0) {
        return
      }

      try {
        await this.request(`profiles/${profileId}/relationships/tags`, {
          method: "POST",
          json: {
            data: props.tags.map((tagId) => ({ type: "tag", id: tagId })),
          },
        })
      } catch (error) {
        if (
          error instanceof KlaviyoRequestError &&
          (error.details.join(" ").toLowerCase().includes("already") ||
            error.details.join(" ").toLowerCase().includes("exists"))
        ) {
          return
        }
        throw error
      }
    }

    // Call upsert directly
    const profile = await upsertProfile()

    // Add to list if listId is provided
    const addToListPromise = props.listId
      ? addToListIfNeeded(profile.id)
      : Promise.resolve()

    // Add tags if provided
    const addTagsPromise =
      props.tags && props.tags.length > 0
        ? addTagsIfNeeded(profile.id)
        : Promise.resolve()

    await Promise.all([addToListPromise, addTagsPromise])

    return {
      id: profile.id,
      email: profile.email,
    }
  }
}
