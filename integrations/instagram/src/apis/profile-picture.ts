import { DEFAULT_API_VERSION } from "../constants"
import { rescue } from "../exception"
import { instagramBusinessClient } from "../lib/http-client"

type ProfilePictureResponse = { profile_picture_url?: string }

/**
 * The profile picture URL of the Instagram professional account behind an
 * Instagram Login token: `GET graph.instagram.com/me?fields=profile_picture_url`.
 * The URL is a temporary CDN link, so callers must re-host the image. The token
 * goes in the Authorization header. Returns `null` when the field is absent.
 * Docs: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/get-started
 */
export const fetchInstagramProfilePictureUrl = (props: {
  accessToken: string
  version?: string
}): Promise<string | null> => {
  const { accessToken, version = DEFAULT_API_VERSION } = props
  const endpoint = `${version}/me`

  return rescue(endpoint, async () => {
    const queries = new URLSearchParams({ fields: "profile_picture_url" })
    const response = await instagramBusinessClient.get<ProfilePictureResponse>(
      `${endpoint}?${queries.toString()}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    return response.profile_picture_url || null
  })
}
