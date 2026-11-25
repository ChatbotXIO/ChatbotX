import { createInstagramPublisher } from "./publisher-core"
import { callFacebookGraph } from "./publisher-graph"

/**
 * Instagram publishing through Facebook Login: the same Content Publishing
 * calls on graph.facebook.com with the linked Facebook Page token.
 * UNVERIFIED: that a Page token publishes on graph.facebook.com exactly like
 * the Instagram user token does on graph.instagram.com (the container, status
 * and media_publish endpoints are documented for both hosts).
 */
export const instagramFacebookPublisher = createInstagramPublisher({
  callGraph: callFacebookGraph,
  canDelete: true,
  via: "instagramFacebook",
})
