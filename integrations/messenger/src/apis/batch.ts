import { z } from "zod"
import { DEFAULT_API_VERSION } from "../constants"
import { MessengerException, rescue } from "../exception"
import { facebookGraphClient } from "../lib/http-client"
import type { MessengerAuthValue } from "../schema"
import { type BucUsage, mergeBucUsage, parseBucHeader } from "./usage"

/** Meta accepts at most 50 sub-requests in one Graph batch call. */
export const GRAPH_BATCH_MAX_ITEMS = 50

/**
 * Graph answers a slow sub-request with `null` after its own deadline, so the
 * whole call is bounded here too: a hung batch must not eat the chunk budget
 * of the job that issued it.
 */
const GRAPH_BATCH_TIMEOUT_MS = 25_000

export type GraphBatchRequest = {
  /** Path without the version, e.g. `me/messages`. */
  relativeUrl: string
  /** Form fields; object values are JSON-encoded as Graph expects. */
  body: Record<string, unknown>
}

/**
 * One sub-response. `unknown` = Graph returned `null` for it (the sub-request
 * timed out), so whether it ran is not known. `error` carries the sub-request's
 * own HTTP status and Graph error body, ready for `mapToChannelError`.
 */
export type GraphBatchResult =
  | { kind: "ok"; body: unknown }
  | {
      kind: "error"
      httpStatus: number
      errorBody: { error?: Record<string, unknown> } | undefined
    }
  | { kind: "unknown" }

const subResponseSchema = z
  .object({
    code: z.number(),
    // Each sub-response carries its own headers, as `[{ name, value }]`.
    headers: z
      .array(z.object({ name: z.string(), value: z.string() }))
      .nullish(),
    body: z.string().nullish(),
  })
  .nullable()

const batchResponseSchema = z.array(subResponseSchema)

const HTTP_OK = 200

const encodeForm = (fields: Record<string, unknown>): string => {
  const form = new URLSearchParams()
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) {
      continue
    }
    form.set(
      key,
      typeof value === "object" ? JSON.stringify(value) : String(value),
    )
  }
  return form.toString()
}

const parseBody = (raw: string | null | undefined): unknown => {
  if (!raw) {
    return
  }
  try {
    return JSON.parse(raw)
  } catch {
    return
  }
}

const BUC_HEADER = "x-business-use-case-usage"

/** The quota reading a sub-response carries, if any. */
const readSubResponseUsage = (
  sub: z.infer<typeof subResponseSchema>,
): BucUsage | null => {
  const header = sub?.headers?.find(
    ({ name }) => name.toLowerCase() === BUC_HEADER,
  )
  return parseBucHeader(header?.value ?? null)
}

const toResult = (sub: z.infer<typeof subResponseSchema>): GraphBatchResult => {
  if (sub === null) {
    return { kind: "unknown" }
  }
  const body = parseBody(sub.body)
  if (sub.code === HTTP_OK) {
    return { kind: "ok", body }
  }
  return {
    kind: "error",
    httpStatus: sub.code,
    errorBody:
      typeof body === "object" && body !== null
        ? (body as { error?: Record<string, unknown> })
        : undefined,
  }
}

/**
 * `POST /` with `batch=[…]` — up to {@link GRAPH_BATCH_MAX_ITEMS} sub-requests
 * under one Page token, answered in order. A batch saves round trips, not
 * quota: Meta counts every sub-request as one call. Never retried here (`retry: 0`):
 * the caller owns retry because only it knows which sub-requests are safe to
 * repeat (a send is not). A failure of the call itself (revoked token, a 5xx)
 * throws; a failure of one sub-request is a `GraphBatchResult`.
 *
 * Reference: https://developers.facebook.com/docs/graph-api/batch-requests
 */
export type GraphBatchResponse = {
  results: GraphBatchResult[]
  /**
   * The Page's Business Use Case quota after this call
   * (`X-Business-Use-Case-Usage`, on the call and on each sub-response; the
   * worst reading wins), `null` when Meta sent none. Every
   * sub-request counts against it like a standalone call.
   */
  usage: BucUsage | null
}

export const sendGraphBatch = (
  auth: MessengerAuthValue,
  requests: GraphBatchRequest[],
): Promise<GraphBatchResponse> => {
  if (requests.length === 0) {
    return Promise.resolve({ results: [], usage: null })
  }
  if (requests.length > GRAPH_BATCH_MAX_ITEMS) {
    throw new MessengerException(
      `A Graph batch carries at most ${GRAPH_BATCH_MAX_ITEMS} requests`,
    )
  }
  const { version = DEFAULT_API_VERSION } = auth
  const batch = requests.map((request) => ({
    method: "POST",
    relative_url: `${version}/${request.relativeUrl}`,
    body: encodeForm(request.body),
  }))

  return rescue("batch", async () => {
    const { data, headers } =
      await facebookGraphClient.postWithHeaders<unknown>("", {
        headers: { Authorization: `Bearer ${auth.tokens.accessToken}` },
        body: new URLSearchParams({ batch: JSON.stringify(batch) }),
        retry: 0,
        timeout: GRAPH_BATCH_TIMEOUT_MS,
      })
    const parsed = batchResponseSchema.safeParse(data)
    if (!parsed.success || parsed.data.length !== requests.length) {
      throw new MessengerException("Malformed Graph batch response")
    }
    return {
      results: parsed.data.map(toResult),
      usage: mergeBucUsage([
        parseBucHeader(headers.get(BUC_HEADER)),
        ...parsed.data.map(readSubResponseUsage),
      ]),
    }
  })
}
