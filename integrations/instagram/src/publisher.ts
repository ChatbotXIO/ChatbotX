import { createInstagramPublisher } from "./publisher-core"
import { callGraph } from "./publisher-graph"

export { instagramFacebookPublisher } from "./publisher-facebook-graph"

/** Instagram Login (graph.instagram.com). */
export const instagramPublisher = createInstagramPublisher({
  callGraph,
  canDelete: false,
  via: "instagram",
})
