import { DEFAULT_API_VERSION } from "../constants"
import { rescue } from "../exception"
import { instagramGraphClient } from "../lib/http-client"

export type InstagramContactProfile = {
  followersCount: number | null
  isVerified: boolean | null
  followsBusiness: boolean | null
  businessFollowUser: boolean | null
}

type RawContactProfileResponse = {
  id: string
  follower_count?: number
  is_verified?: boolean
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
    const queries = new URLSearchParams({
      fields:
        "follower_count,is_verified,is_user_follow_business,is_business_follow_user",
      access_token: accessToken,
    })

    const response = await instagramGraphClient.get<RawContactProfileResponse>(
      `${endpoint}?${queries.toString()}`,
    )

    return {
      followersCount: response.follower_count ?? null,
      isVerified: response.is_verified ?? null,
      followsBusiness: response.is_user_follow_business ?? null,
      businessFollowUser: response.is_business_follow_user ?? null,
    }
  })
}
