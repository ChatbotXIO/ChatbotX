const SENSITIVE_PARAM_NAMES = [
  "access_token",
  "client_secret",
  "refresh_token",
  "authorization",
]

const URL_REGEX = /https?:\/\/[^\s"'`]+/giu

function maskIfSensitive(key: string, value: string): string {
  if (!SENSITIVE_PARAM_NAMES.includes(key.toLowerCase())) {
    return value
  }

  return "[REDACTED]"
}

function sanitizeUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl)
    for (const key of url.searchParams.keys()) {
      const currentValue = url.searchParams.get(key)
      if (currentValue !== null) {
        url.searchParams.set(key, maskIfSensitive(key, currentValue))
      }
    }
    return url.toString()
  } catch {
    return rawUrl
  }
}

export function sanitizeSensitiveText(value: string): string {
  let sanitized = value.replace(URL_REGEX, (url) => sanitizeUrl(url))

  for (const key of SENSITIVE_PARAM_NAMES) {
    const queryPattern = new RegExp(`([?&]${key}=)([^&#\\s]+)`, "giu")
    sanitized = sanitized.replace(queryPattern, "$1[REDACTED]")

    const assignmentPattern = new RegExp(
      `(["']?${key}["']?\\s*[:=]\\s*["']?)([^"',\\s}]+)(["']?)`,
      "giu",
    )
    sanitized = sanitized.replace(assignmentPattern, "$1[REDACTED]$3")
  }

  return sanitized
}

export function getSafeErrorDetails(error: unknown): {
  code?: string | number
  httpStatusCode?: number
  subCode?: string | number | null
  type?: string
  message: string
} {
  if (error instanceof Error) {
    const typedError = error as Error & {
      code?: string | number
      httpStatusCode?: number
      subCode?: string | number | null
      type?: string
    }

    return {
      code: typedError.code,
      httpStatusCode: typedError.httpStatusCode,
      subCode: typedError.subCode,
      type: typedError.type,
      message: sanitizeSensitiveText(error.message),
    }
  }

  return {
    message: sanitizeSensitiveText(String(error)),
  }
}
