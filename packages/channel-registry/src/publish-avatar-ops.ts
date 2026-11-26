import type { AvatarOps } from "@chatbotx.io/business"
import { fetchInstagramProfilePictureUrl } from "@chatbotx.io/integration-instagram/apis/profile-picture"
import { fetchInstagramFacebookProfilePictureUrl } from "@chatbotx.io/integration-instagram-facebook/apis/profile-picture"
import { fetchFacebookPagePictureUrl } from "@chatbotx.io/integration-messenger/apis/page-picture"
import { fetchThreadsProfilePictureUrl } from "@chatbotx.io/integration-threads/apis/profile-picture"

/**
 * The network calls behind a publish destination's picture, for the worker job.
 * Each returns a temporary URL the job re-hosts; the token is only ever passed
 * to these calls, in an Authorization header.
 */
export const createPublishAvatarOps = (): AvatarOps => ({
  fetchPictureUrl: ({ accessToken, externalId, publisherKey }) => {
    switch (publisherKey) {
      case "facebook":
        return fetchFacebookPagePictureUrl({ accessToken, pageId: externalId })
      case "instagram":
        return fetchInstagramProfilePictureUrl({ accessToken })
      case "instagramFacebook":
        return fetchInstagramFacebookProfilePictureUrl({
          accessToken,
          igId: externalId,
        })
      case "threads":
        return fetchThreadsProfilePictureUrl({ accessToken })
      default: {
        const unreachable: never = publisherKey
        return Promise.reject(
          new Error(`No picture source for ${String(unreachable)}`),
        )
      }
    }
  },
})
