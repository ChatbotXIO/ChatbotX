import { DEFAULT_API_VERSION } from "../constants"
import { rescue } from "../exception"
import { instagramGraphClient } from "../lib/http-client"

export type InstagramContactProfile = {
  username: string | null
  followersCount: number | null
  isVerified: boolean | null
  followsBusiness: boolean | null
  businessFollowUser: boolean | null
}

type RawContactProfileResponse = {
  id: string
  username?: string
  follower_count?: number
  // Instagram User Profile API (both Facebook-Login and Instagram-Login
  // variants) returns `is_verified_user`, per Meta docs + the v12.0 changelog.
  // `is_verified` is not a field on this endpoint and always came back missing.
  is_verified_user?: boolean
  is_user_follow_business?: boolean
  is_business_follow_user?: boolean
}

export const fetchInstagramContactProfile = (props: {
  igsid: string
  accessToken: string
  version?: string
}): Promise<InstagramContactProfile> => {
  const { igsid, accessToken, version = DEFAULT_API_VERSION } = props
  const endpoint = `${version}/${igsid}`

  return rescue(endpoint, async () => {
    // Auth goes in the Authorization header, never the query string: a Graph
    // request URL is captured verbatim on HTTP-client errors (and their logs),
    // so a query `access_token` would leak on every timeout/network failure.
    const queries = new URLSearchParams({
      fields:
        "username,follower_count,is_verified_user,is_user_follow_business,is_business_follow_user",
    })

    const response = await instagramGraphClient.get<RawContactProfileResponse>(
      `${endpoint}?${queries.toString()}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )

    return {
      username: response.username ?? null,
      followersCount: response.follower_count ?? null,
      isVerified: response.is_verified_user ?? null,
      followsBusiness: response.is_user_follow_business ?? null,
      businessFollowUser: response.is_business_follow_user ?? null,
    }
  })
}
