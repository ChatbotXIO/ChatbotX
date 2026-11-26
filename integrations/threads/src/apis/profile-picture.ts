import { DEFAULT_API_VERSION } from "../constants"
import { rescue } from "../exception"
import { threadsGraphClient } from "../lib/http-client"

type ProfilePictureResponse = { threads_profile_picture_url?: string }

/**
 * The profile picture URL of the Threads account behind a token:
 * `GET graph.threads.com/me?fields=threads_profile_picture_url` (the same Graph
 * host as `graph.threads.net`; the repo's client is configured for `.com`). The
 * URL is a temporary CDN link, so callers must re-host the image. The token goes
 * in the Authorization header. Returns `null` when the field is absent.
 * Docs: https://developers.facebook.com/docs/threads/threads-profiles
 */
export const fetchThreadsProfilePictureUrl = (props: {
  accessToken: string
  version?: string
}): Promise<string | null> => {
  const { accessToken, version = DEFAULT_API_VERSION } = props
  const endpoint = `${version}/me`

  return rescue(endpoint, async () => {
    const response = await threadsGraphClient.get<ProfilePictureResponse>(
      endpoint,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        searchParams: { fields: "threads_profile_picture_url" },
      },
    )
    return response.threads_profile_picture_url || null
  })
}
