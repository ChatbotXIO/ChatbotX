import { assertPublicUrl } from "@chatbotx.io/business"
import {
  fetchFollowingSafeRedirects,
  readBodyWithLimit,
} from "@chatbotx.io/filesystem"
import ky from "ky"
import { ExpectedHeavyStepError } from "./errors"

const MAX_REDIRECTS = 5

type DownloadWithByteLimitOptions = {
  allowedMimeTypes?: ReadonlySet<string>
  label: string
  maxBytes: number
  signal: AbortSignal
  timeout?: number
  url: string
}

type DownloadedBuffer = {
  buffer: Buffer
  contentType: string
  rawContentType: string
}

function parseContentLength(response: Response): number | null {
  const header = response.headers.get("content-length")
  if (header === null) {
    return null
  }

  const parsed = Number.parseInt(header, 10)
  return Number.isNaN(parsed) ? null : parsed
}

function assertContentLengthWithinLimit(
  response: Response,
  label: string,
  maxBytes: number,
) {
  const declared = parseContentLength(response)
  if (declared !== null && declared > maxBytes) {
    throw new ExpectedHeavyStepError(
      `${label} exceeds size limit: ${declared} bytes (max ${maxBytes})`,
    )
  }
}

async function assertSafeDownloadUrl(
  url: string,
  label: string,
): Promise<void> {
  try {
    await assertPublicUrl(url, `${label} URL`)
  } catch (error) {
    throw new ExpectedHeavyStepError(`Unsafe ${label} URL`, { cause: error })
  }
}

export async function downloadWithByteLimit({
  allowedMimeTypes,
  label,
  maxBytes,
  signal,
  timeout,
  url,
}: DownloadWithByteLimitOptions): Promise<DownloadedBuffer> {
  const { response } = await fetchFollowingSafeRedirects({
    errors: {
      tooManyRedirects: () =>
        new ExpectedHeavyStepError(`${label} download exceeded redirect limit`),
      noLocationHeader: () =>
        new ExpectedHeavyStepError(`${label} redirect has no location`),
      invalidRedirectLocation: (_location, cause) =>
        new ExpectedHeavyStepError(
          `${label} redirect has an invalid location`,
          {
            cause,
          },
        ),
    },
    fetchImpl: (candidateUrl) =>
      ky.get(candidateUrl, {
        redirect: "manual",
        signal,
        throwHttpErrors: false,
        timeout,
      }),
    maxRedirectHops: MAX_REDIRECTS,
    url,
    validateUrl: (candidateUrl) => assertSafeDownloadUrl(candidateUrl, label),
  })

  if (!response.ok) {
    const message = `${label} download failed with status ${response.status}`
    if (response.status >= 500) {
      throw new Error(message)
    }
    throw new ExpectedHeavyStepError(message)
  }

  assertContentLengthWithinLimit(response, label, maxBytes)

  const rawContentType = response.headers.get("content-type") ?? ""
  const contentType = rawContentType.split(";")[0]?.trim() ?? ""
  if (allowedMimeTypes && !allowedMimeTypes.has(contentType)) {
    throw new ExpectedHeavyStepError(
      `Unsupported ${label} format: ${rawContentType || "unknown"}`,
    )
  }

  const buffer = await readBodyWithLimit(
    response,
    maxBytes,
    (limit) =>
      new ExpectedHeavyStepError(
        `${label} body exceeds size limit: >${limit} bytes`,
      ),
  )
  return { buffer, contentType, rawContentType }
}
