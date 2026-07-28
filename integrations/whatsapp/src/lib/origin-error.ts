export type WhatsappOriginErrorDetail = {
  userTitle?: string
  userMessage?: string
  fbtraceId?: string
}

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined

const readOptionalString = (
  source: Record<string, unknown> | undefined,
  key: string,
): string | undefined =>
  source && typeof source[key] === "string" ? source[key] : undefined

function readNormalizedOriginError(
  originError: unknown,
): WhatsappOriginErrorDetail {
  const source = asRecord(originError)

  return {
    userTitle: readOptionalString(source, "userTitle"),
    userMessage: readOptionalString(source, "userMessage"),
    fbtraceId: readOptionalString(source, "fbtraceId"),
  }
}

function readFacebookErrorPayload(
  originError: unknown,
): WhatsappOriginErrorDetail {
  const source = asRecord(originError)
  const response = asRecord(source?.response)
  const errorBody = asRecord(source?.errorBody)
  const error =
    asRecord(source?.error) ??
    asRecord(response?.error) ??
    asRecord(errorBody?.error)

  return {
    userTitle: readOptionalString(error, "error_user_title"),
    userMessage: readOptionalString(error, "error_user_msg"),
    fbtraceId: readOptionalString(error, "fbtrace_id"),
  }
}

export function readWhatsappOriginErrorDetail(
  originError: unknown,
): WhatsappOriginErrorDetail {
  const normalized = readNormalizedOriginError(originError)
  const facebook = readFacebookErrorPayload(originError)

  return {
    userTitle: normalized.userTitle ?? facebook.userTitle,
    userMessage: normalized.userMessage ?? facebook.userMessage,
    fbtraceId: normalized.fbtraceId ?? facebook.fbtraceId,
  }
}
