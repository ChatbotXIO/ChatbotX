import { DEFAULT_API_VERSION } from "../constants"
import { rescue } from "../exception"
import { instagramGraphClient } from "../lib/http-client"

type ProfilePictureResponse = { profile_picture_url?: string }

/**
 * The profile picture URL of an Instagram professional account linked to a
 * Facebook Page: `GET graph.facebook.com/{ig-user-id}?fields=profile_picture_url`
 * with the Page token. The URL is a temporary CDN link, so callers must re-host
 * the image. The token goes in the Authorization header. Returns `null` when the
 * field is absent.
 * Docs: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/reference/ig-user
 */
export const fetchInstagramFacebookProfilePictureUrl = (props: {
  accessToken: string
  igId: string
  version?: string
}): Promise<string | null> => {
  const { accessToken, igId, version = DEFAULT_API_VERSION } = props
  const endpoint = `${version}/${igId}`

  return rescue(endpoint, async () => {
    const queries = new URLSearchParams({ fields: "profile_picture_url" })
    const response = await instagramGraphClient.get<ProfilePictureResponse>(
      `${endpoint}?${queries.toString()}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    return response.profile_picture_url || null
  })
}
