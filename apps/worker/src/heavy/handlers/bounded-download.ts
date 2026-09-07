import { assertPublicUrl } from "@chatbotx.io/business"
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

async function readBodyWithLimit(
  response: Response,
  label: string,
  maxBytes: number,
): Promise<Buffer> {
  const body = response.body
  if (!body) {
    throw new ExpectedHeavyStepError(`${label} has no response body`)
  }

  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    if (!value) {
      continue
    }

    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw new ExpectedHeavyStepError(
        `${label} body exceeds size limit: >${maxBytes} bytes`,
      )
    }

    chunks.push(value)
  }

  return Buffer.concat(chunks, total)
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

async function getFollowingSafeRedirects(input: {
  redirectsLeft: number
  request: Pick<DownloadWithByteLimitOptions, "label" | "signal" | "timeout">
  url: string
}): Promise<Response> {
  await assertSafeDownloadUrl(input.url, input.request.label)

  const response = await ky.get(input.url, {
    redirect: "manual",
    signal: input.request.signal,
    throwHttpErrors: false,
    timeout: input.request.timeout,
  })

  if (response.status < 300 || response.status >= 400) {
    return response
  }

  if (input.redirectsLeft <= 0) {
    throw new ExpectedHeavyStepError(
      `${input.request.label} download exceeded redirect limit`,
    )
  }

  const location = response.headers.get("location")
  if (!location) {
    throw new ExpectedHeavyStepError(
      `${input.request.label} redirect has no location`,
    )
  }

  let redirectUrl: string
  try {
    redirectUrl = new URL(location, input.url).href
  } catch (error) {
    throw new ExpectedHeavyStepError(
      `${input.request.label} redirect has an invalid location`,
      { cause: error },
    )
  }

  return getFollowingSafeRedirects({
    redirectsLeft: input.redirectsLeft - 1,
    request: input.request,
    url: redirectUrl,
  })
}

export async function downloadWithByteLimit({
  allowedMimeTypes,
  label,
  maxBytes,
  signal,
  timeout,
  url,
}: DownloadWithByteLimitOptions): Promise<DownloadedBuffer> {
  const response = await getFollowingSafeRedirects({
    redirectsLeft: MAX_REDIRECTS,
    request: { label, signal, timeout },
    url,
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

  const buffer = await readBodyWithLimit(response, label, maxBytes)
  return { buffer, contentType, rawContentType }
}
