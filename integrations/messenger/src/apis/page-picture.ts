import { DEFAULT_API_VERSION } from "../constants"
import { rescue } from "../exception"
import { facebookGraphClient } from "../lib/http-client"

type PagePictureResponse = {
  data?: { is_silhouette?: boolean; url?: string }
}

/**
 * The profile picture URL of a Facebook Page. Graph answers
 * `GET /{page-id}/picture?redirect=0&type=large` with `{ data: { url } }`
 * instead of redirecting to the image. The URL is temporary (it carries a
 * signature and expires), so callers must re-host the image. The token goes in
 * the Authorization header, never the query string, so a failing request URL
 * cannot leak it into logs. Returns `null` when the Page has no picture (a
 * silhouette placeholder is treated as none).
 * Docs: https://developers.facebook.com/docs/graph-api/reference/page/picture/
 */
export const fetchFacebookPagePictureUrl = (props: {
  accessToken: string
  pageId: string
  version?: string
}): Promise<string | null> => {
  const { accessToken, pageId, version = DEFAULT_API_VERSION } = props
  const endpoint = `${version}/${pageId}/picture`

  return rescue(endpoint, async () => {
    const response = await facebookGraphClient.get<PagePictureResponse>(
      endpoint,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        searchParams: { redirect: "0", type: "large" },
      },
    )
    if (response.data?.is_silhouette) {
      return null
    }
    return response.data?.url || null
  })
}
