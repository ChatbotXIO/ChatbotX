import { parseBucHeader } from "@chatbotx.io/integration-messenger/apis/usage"
import { DEFAULT_API_VERSION } from "../constants"
import { graphAuthHeaders, metaCatalogGraphClient } from "../lib/http-client"
import type {
  MetaCatalogBatchItemResult,
  MetaCatalogBatchRequest,
} from "../schemas"

type SubmitResponse = {
  handles?: string[]
  handle?: string
}

type RawBatchError = {
  message?: string
}

type RawBatchStatus = {
  status?: string
  errors?: Array<RawBatchError | string>
  errors_total_count?: number
  ids_of_invalid_requests?: Array<string | number>
}

/** The only catalog entity this integration writes. */
const BATCH_ITEM_TYPE = "PRODUCT_ITEM"
const COMPLETED_BATCH_STATUSES = new Set(["completed", "finished"])
const DEFAULT_BATCH_ITEM_ERROR = "Meta rejected this catalog item"
const UNRESOLVED_BATCH_ERROR =
  "Meta reported catalog item errors without recognizable retailer IDs"

const getBatchErrorMessage = (statuses: RawBatchStatus[]): string | undefined =>
  statuses
    .flatMap((status) => status.errors ?? [])
    .map((error) => (typeof error === "string" ? error : error.message))
    .find((message): message is string => Boolean(message))

const parseBatchResults = (
  statuses: RawBatchStatus[],
  retailerIds: readonly string[],
): MetaCatalogBatchItemResult[] => {
  const requestedRetailerIds = new Set(retailerIds)
  const invalidRequestIds = statuses.flatMap(
    (status) => status.ids_of_invalid_requests ?? [],
  )
  const recognizedInvalidIds = new Set(
    invalidRequestIds
      .map(String)
      .filter((requestId) => requestedRetailerIds.has(requestId)),
  )
  const reportedErrorCount = statuses.reduce(
    (total, status) =>
      total +
      (status.errors_total_count ??
        status.ids_of_invalid_requests?.length ??
        status.errors?.length ??
        0),
    0,
  )
  const hasUnresolvedErrors =
    invalidRequestIds.length > recognizedInvalidIds.size ||
    reportedErrorCount > recognizedInvalidIds.size
  const errorMessage = getBatchErrorMessage(statuses)

  return retailerIds.map((retailerId) => {
    if (hasUnresolvedErrors) {
      return {
        retailerId,
        success: false,
        error: errorMessage ?? UNRESOLVED_BATCH_ERROR,
      }
    }
    if (recognizedInvalidIds.has(retailerId)) {
      return {
        retailerId,
        success: false,
        error: errorMessage ?? DEFAULT_BATCH_ITEM_ERROR,
      }
    }
    return { retailerId, success: true }
  })
}

export async function submitItemsBatch(input: {
  accessToken: string
  catalogId: string
  requests: MetaCatalogBatchRequest[]
  version?: string
}) {
  const version = input.version ?? DEFAULT_API_VERSION
  const response = await metaCatalogGraphClient.post<SubmitResponse>(
    `${version}/${input.catalogId}/items_batch`,
    {
      headers: graphAuthHeaders(input.accessToken),
      // Form-encoded with `requests` as a JSON string. Handing Graph the same
      // payload as a JSON document returns 200 with no handle, so the batch is
      // never queued and the run dies on "Meta did not return a batch handle".
      form: {
        // Without this Graph rejects the call with "(#100) The parameter
        // item_type is required". Every request we build is a catalog product.
        item_type: BATCH_ITEM_TYPE,
        // A linked product always requests UPDATE, and a Content ID is
        // considered immutable forever once linked (see resolveRetailerIds) —
        // so if the item was deleted on Meta's side, this is the only chance
        // to recreate it. With allow_upsert false, Meta just drops that
        // request instead of erroring, which would leave the product silently
        // stuck retrying the same dead retailer_id on every future sync.
        allow_upsert: "true",
        requests: JSON.stringify(
          input.requests.map((request) => ({
            method: request.method,
            // items_batch keys each item by `data.id`, not a sibling
            // `retailer_id` — that field belongs to the older batch edge.
            data: { ...request.data, id: request.retailerId },
          })),
        ),
      },
    },
  )
  const handles =
    response.data.handles ??
    (response.data.handle ? [response.data.handle] : [])
  if (handles.length === 0) {
    throw new Error("Meta did not return a catalog batch handle")
  }
  return {
    handles,
    usage: parseBucHeader(response.businessUsageHeader),
  }
}

export async function checkItemsBatch(input: {
  accessToken: string
  catalogId: string
  handle: string
  retailerIds: readonly string[]
  version?: string
}): Promise<{
  completed: boolean
  results: MetaCatalogBatchItemResult[]
}> {
  const version = input.version ?? DEFAULT_API_VERSION
  const response = await metaCatalogGraphClient.get<{
    data?: RawBatchStatus[]
  }>(`${version}/${input.catalogId}/check_batch_request_status`, {
    headers: graphAuthHeaders(input.accessToken),
    searchParams: {
      handle: input.handle,
      fields: "status,errors,errors_total_count,ids_of_invalid_requests,handle",
    },
  })
  const statuses = response.data.data ?? []
  const completed =
    statuses.length > 0 &&
    statuses.every((status) =>
      COMPLETED_BATCH_STATUSES.has(status.status?.toLowerCase() ?? ""),
    )

  return {
    completed,
    results: completed ? parseBatchResults(statuses, input.retailerIds) : [],
  }
}
