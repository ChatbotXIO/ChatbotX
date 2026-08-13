import { z } from "zod"
import { DEFAULT_API_VERSION } from "../constants"
import { rescue } from "../exception"
import { facebookAdsGraphClient } from "../lib/http-client"

const createCustomAudienceResponseSchema = z.object({
  id: z.string().trim().min(1),
})

export type CreateCustomAudienceInput = {
  accessToken: string
  adAccountId: string
  name: string
  description?: string | null
  version?: string
}

export function createCustomAudience({
  accessToken,
  adAccountId,
  name,
  description,
  version = DEFAULT_API_VERSION,
}: CreateCustomAudienceInput): Promise<{ id: string }> {
  const endpoint = `${version}/${adAccountId}/customaudiences`

  return rescue(endpoint, async () => {
    const response = await facebookAdsGraphClient.post<unknown>(endpoint, {
      searchParams: { access_token: accessToken },
      json: {
        name,
        ...(description ? { description } : {}),
        subtype: "CUSTOM",
        customer_file_source: "USER_PROVIDED_ONLY",
      },
    })

    return createCustomAudienceResponseSchema.parse(response)
  })
}
