import { z } from "zod"
import { DEFAULT_API_VERSION } from "../constants"
import { rescueMetaConversions } from "../exception"
import {
  graphAuthHeaders,
  metaConversionsGraphClient,
} from "../lib/http-client"

export const datasetEndpointByResourceType = {
  page: (resourceId: string) => `${resourceId}/dataset`,
  igUser: (resourceId: string) => `${resourceId}/dataset`,
  waba: (resourceId: string) => `${resourceId}/dataset`,
} as const satisfies Record<
  EnsureDatasetInput["resourceType"],
  (resourceId: string) => string
>

const datasetIdResponseSchema = z.union([
  z.object({ id: z.string().trim().min(1) }),
  z.object({ dataset_id: z.string().trim().min(1) }),
  z.object({
    data: z.object({ id: z.string().trim().min(1) }),
  }),
  z.object({
    dataset: z.object({ id: z.string().trim().min(1) }),
  }),
])

/** Suffix Meta itself appends to the auto-generated dataset name. */
export const DATASET_NAME_SUFFIX = "Event Data"

/**
 * Builds the dataset name shown in Events Manager from a resource's display
 * name, e.g. `"Acme Page"` -> `"Acme Page Event Data"`. Falls back to the bare
 * suffix when the resource has no usable name.
 */
export const buildDatasetName = (resourceName: string): string => {
  const trimmed = resourceName.trim()
  return trimmed ? `${trimmed} ${DATASET_NAME_SUFFIX}` : DATASET_NAME_SUFFIX
}

export type EnsureDatasetInput = {
  resourceType: "page" | "igUser" | "waba"
  resourceId: string
  accessToken: string
  /**
   * Human-readable name for the dataset (e.g. `"Acme Page Event Data"`). When
   * omitted or blank, Meta assigns its default ("unknown Event Data"), so
   * callers should always pass one for a freshly created dataset. The edge is
   * idempotent, so this only names the dataset on first creation.
   */
  datasetName?: string
  version?: string
}

export type GetDatasetInput = {
  datasetId: string
  accessToken: string
  version?: string
}

const readDatasetId = (response: unknown): string => {
  const parsed = datasetIdResponseSchema.parse(response)
  if ("id" in parsed) {
    return parsed.id
  }
  if ("dataset_id" in parsed) {
    return parsed.dataset_id
  }
  if ("data" in parsed) {
    return parsed.data.id
  }
  return parsed.dataset.id
}

export const ensureDataset = ({
  resourceType,
  resourceId,
  accessToken,
  datasetName,
  version = DEFAULT_API_VERSION,
}: EnsureDatasetInput): Promise<string> =>
  rescueMetaConversions(async () => {
    const trimmedName = datasetName?.trim()
    const response = await metaConversionsGraphClient.post<unknown>(
      `${version}/${datasetEndpointByResourceType[resourceType](resourceId)}`,
      {
        headers: graphAuthHeaders(accessToken),
        ...(trimmedName ? { json: { dataset_name: trimmedName } } : {}),
      },
    )

    return readDatasetId(response.data)
  })

export const getDataset = ({
  datasetId,
  accessToken,
  version = DEFAULT_API_VERSION,
}: GetDatasetInput): Promise<string> =>
  rescueMetaConversions(async () => {
    const response = await metaConversionsGraphClient.get<unknown>(
      `${version}/${datasetId}`,
      {
        headers: graphAuthHeaders(accessToken),
        searchParams: { fields: "id" },
      },
    )

    return readDatasetId(response.data)
  })
