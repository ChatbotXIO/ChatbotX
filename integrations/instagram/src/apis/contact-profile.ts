import { DEFAULT_API_VERSION } from "../constants"
import { rescue } from "../exception"
import { instagramBusinessClient } from "../lib/http-client"
import type { InstagramContactProfile } from "../schemas"

type RawContactProfileResponse = {
  id: string
  username?: string
  follower_count?: number
  is_user_follow_business?: boolean
  is_business_follow_user?: boolean
  is_verified_user?: boolean
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
        "username,follower_count,is_user_follow_business,is_business_follow_user,is_verified_user",
      access_token: accessToken,
    })

    const response =
      await instagramBusinessClient.get<RawContactProfileResponse>(
        `${endpoint}?${queries.toString()}`,
      )

    return {
      username: response.username ?? null,
      followersCount: response.follower_count ?? null,
      followsBusiness: response.is_user_follow_business ?? null,
      businessFollowUser: response.is_business_follow_user ?? null,
      isVerified: response.is_verified_user ?? null,
    }
  })
}
