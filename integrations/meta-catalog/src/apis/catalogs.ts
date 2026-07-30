import { DEFAULT_API_VERSION } from "../constants"
import { graphAuthHeaders, metaCatalogGraphClient } from "../lib/http-client"
import type { MetaCatalog, MetaCatalogBusiness } from "../schemas"

/**
 * Graph's vertical for a catalog that backs Messenger/Instagram shopping.
 * Other verticals (hotels, flights, vehicles, …) expect a different item
 * schema, so a catalog created with the wrong one silently rejects every
 * product we push.
 */
const COMMERCE_VERTICAL = "commerce"

export async function getCatalog(
  accessToken: string,
  catalogId: string,
  version: string = DEFAULT_API_VERSION,
): Promise<MetaCatalog> {
  const response = await metaCatalogGraphClient.get<{
    id: string
    name?: string
    business?: { id?: string }
  }>(`${version}/${catalogId}`, {
    headers: graphAuthHeaders(accessToken),
    searchParams: { fields: "id,name,business" },
  })
  return {
    id: response.data.id,
    name: response.data.name,
    businessId: response.data.business?.id,
  }
}

/**
 * Business Manager accounts the token can act on. A catalog is always owned by
 * one of them, so this is what the user picks from before we can create one.
 */
export async function listBusinesses(
  accessToken: string,
  version: string = DEFAULT_API_VERSION,
): Promise<MetaCatalogBusiness[]> {
  const response = await metaCatalogGraphClient.get<{
    data?: Array<{ id?: string; name?: string }>
  }>(`${version}/me/businesses`, {
    headers: graphAuthHeaders(accessToken),
    searchParams: { fields: "id,name", limit: "100" },
  })
  return (response.data.data ?? [])
    .filter((business): business is { id: string; name?: string } =>
      Boolean(business.id),
    )
    .map((business) => ({ id: business.id, name: business.name }))
}

export async function createCatalog(input: {
  accessToken: string
  businessId: string
  name: string
  version?: string
}): Promise<MetaCatalog> {
  const version = input.version ?? DEFAULT_API_VERSION
  const response = await metaCatalogGraphClient.post<{ id?: string }>(
    `${version}/${input.businessId}/owned_product_catalogs`,
    {
      headers: graphAuthHeaders(input.accessToken),
      form: {
        name: input.name,
        vertical: COMMERCE_VERTICAL,
      },
    },
  )
  if (!response.data.id) {
    throw new Error("Meta did not return an ID for the new catalog")
  }
  return {
    id: response.data.id,
    name: input.name,
    businessId: input.businessId,
  }
}
