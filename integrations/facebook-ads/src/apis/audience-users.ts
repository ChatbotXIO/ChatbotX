import { type CountryCode, parsePhoneNumberFromString } from "libphonenumber-js"
import { DEFAULT_API_VERSION } from "../constants"
import { rescue } from "../exception"
import { facebookAdsGraphClient } from "../lib/http-client"
import type { AudienceContact, CustomAudienceOperation } from "../schemas"

const ISO_COUNTRY_CODE_REGEX = /^[A-Z]{2}$/
export const AUDIENCE_USERS_BATCH_SIZE = 5000

export type AudienceUsersPayload = {
  schema: string[]
  is_raw?: boolean
  page_ids?: string[]
  data: string[][]
}

// Graph spec: "In case a key is unknown, it should be left blank" — multi-key
// rows use empty strings for missing identifiers, never null.
const toBlankableRow = (values: (string | null)[]): string[] =>
  values.map((value) => value ?? "")

export type HashedAudienceIdentity = {
  phone: string | null
  email: string | null
  firstName: string | null
  lastName: string | null
}

const toRegion = (country?: string | null): CountryCode | undefined => {
  const trimmed = country?.trim().toUpperCase()
  return trimmed && ISO_COUNTRY_CODE_REGEX.test(trimmed)
    ? (trimmed as CountryCode)
    : undefined
}

const parseWithRegion = (
  phone: string,
  region: CountryCode | undefined,
): string | null => {
  const parsed = parsePhoneNumberFromString(phone.trim(), region)
  return parsed?.isValid() ? parsed.number.replace("+", "") : null
}

/**
 * Normalize a phone number for Custom Audience matching. Prefers a proper
 * E.164 parse using the contact's ISO country code, then the workspace-level
 * fallback country. A local-format number (leading "0") with no usable region
 * returns null — guessing a calling code would hash to the wrong identity.
 */
export function normalizePhoneNumber(
  phone: string,
  country?: string | null,
  fallbackCountry?: string | null,
): string | null {
  const region = toRegion(country)
  const fallbackRegion = toRegion(fallbackCountry)

  const parsed =
    parseWithRegion(phone, region) ??
    (fallbackRegion && fallbackRegion !== region
      ? parseWithRegion(phone, fallbackRegion)
      : null)
  if (parsed) {
    return parsed
  }

  const digits = phone.replace(/\D/g, "")
  if (!digits || digits.startsWith("0")) {
    return null
  }
  return digits
}

// Web Crypto (globalThis.crypto.subtle) is available in both the Node worker
// runtime and the Edge runtime, so this stays importable from the builder's
// middleware graph without pulling in `node:crypto`.
async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value)
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

async function hashField(value?: string | null): Promise<string | null> {
  const normalized = value?.trim().toLowerCase()
  return normalized ? await sha256(normalized) : null
}

export async function buildHashedAudienceIdentity(
  contact: AudienceContact,
  fallbackCountry?: string | null,
): Promise<HashedAudienceIdentity | null> {
  if (!(contact.phoneNumber || contact.email)) {
    return null
  }

  const normalizedPhone = contact.phoneNumber
    ? normalizePhoneNumber(
        contact.phoneNumber,
        contact.country,
        fallbackCountry,
      )
    : null

  const [phone, email, firstName, lastName] = await Promise.all([
    normalizedPhone ? sha256(normalizedPhone) : Promise.resolve(null),
    hashField(contact.email),
    hashField(contact.firstName),
    hashField(contact.lastName),
  ])

  if (!(phone || email)) {
    return null
  }

  return { phone, email, firstName, lastName }
}

/** Payload for a normal custom audience keyed by Messenger page-scoped id. */
export function buildPageUidPayload({
  psid,
  pageId,
}: {
  psid: string
  pageId: string
}): AudienceUsersPayload {
  return {
    schema: ["PAGEUID"],
    // PAGEUID is a raw (unhashed) key; the Graph default is_raw=false is for
    // combinational hashed keys, so it must be set explicitly here.
    is_raw: true,
    page_ids: [pageId],
    data: [[psid]],
  }
}

/**
 * Payload for a messenger-marketing-message audience, keyed by SHA-256 hashed
 * contact PII. Returns null when the contact has neither phone nor email —
 * Facebook cannot match such a row.
 */
export async function buildHashedPayload(
  contact: AudienceContact,
  fallbackCountry?: string | null,
): Promise<AudienceUsersPayload | null> {
  const identity = await buildHashedAudienceIdentity(contact, fallbackCountry)
  if (!identity) {
    return null
  }

  return {
    schema: ["PHONE", "EMAIL", "FN", "LN"],
    data: [
      toBlankableRow([
        identity.phone,
        identity.email,
        identity.firstName,
        identity.lastName,
      ]),
    ],
  }
}

export async function buildBulkHashedAudiencePayload(
  contacts: AudienceContact[],
  fallbackCountry?: string | null,
): Promise<AudienceUsersPayload | null> {
  const identities = (
    await Promise.all(
      contacts.map((contact) =>
        buildHashedAudienceIdentity(contact, fallbackCountry),
      ),
    )
  ).filter((identity): identity is HashedAudienceIdentity => Boolean(identity))

  if (identities.length === 0) {
    return null
  }

  const hasEmail = identities.some((identity) => Boolean(identity.email))
  if (!hasEmail) {
    return {
      schema: ["PHONE"],
      data: identities.flatMap((identity) =>
        identity.phone ? [[identity.phone]] : [],
      ),
    }
  }

  return {
    schema: ["PHONE", "EMAIL"],
    data: identities.map((identity) =>
      toBlankableRow([identity.phone, identity.email]),
    ),
  }
}

/**
 * The page id of a messenger-marketing-message audience, or null for a normal
 * custom audience. Mirrors the legacy product's auto-detection.
 */
export function getAudienceMarketingMessagesPage(
  accessToken: string,
  customAudienceId: string,
  version: string = DEFAULT_API_VERSION,
): Promise<string | null> {
  const endpoint = `${version}/${customAudienceId}`

  return rescue(endpoint, async () => {
    const res: { messenger_marketing_messages_page?: { id?: string } | null } =
      await facebookAdsGraphClient.get(endpoint, {
        searchParams: {
          fields: "messenger_marketing_messages_page",
          access_token: accessToken,
        },
      })
    return res.messenger_marketing_messages_page?.id ?? null
  })
}

export function mutateAudienceUsers({
  accessToken,
  customAudienceId,
  operation,
  payload,
  version = DEFAULT_API_VERSION,
}: {
  accessToken: string
  customAudienceId: string
  operation: CustomAudienceOperation
  payload: AudienceUsersPayload
  version?: string
}): Promise<void> {
  const endpoint = `${version}/${customAudienceId}/users`
  const options = {
    searchParams: { access_token: accessToken },
    json: { payload },
  }

  return rescue(endpoint, async () => {
    if (operation === "add") {
      await facebookAdsGraphClient.post(endpoint, options)
      return
    }
    await facebookAdsGraphClient.delete(endpoint, options)
  })
}

export async function bulkSyncHashedAudienceUsers({
  accessToken,
  customAudienceId,
  contacts,
  operation,
  fallbackCountry,
  version = DEFAULT_API_VERSION,
}: {
  accessToken: string
  customAudienceId: string
  contacts: AudienceContact[]
  operation: CustomAudienceOperation
  fallbackCountry?: string | null
  version?: string
}): Promise<{ received: number; batches: number }> {
  let received = 0
  let batches = 0

  for (
    let start = 0;
    start < contacts.length;
    start += AUDIENCE_USERS_BATCH_SIZE
  ) {
    const payload = await buildBulkHashedAudiencePayload(
      contacts.slice(start, start + AUDIENCE_USERS_BATCH_SIZE),
      fallbackCountry,
    )
    if (!payload || payload.data.length === 0) {
      continue
    }

    await mutateAudienceUsers({
      accessToken,
      customAudienceId,
      operation,
      payload,
      version,
    })
    received += payload.data.length
    batches += 1
  }

  return { received, batches }
}
