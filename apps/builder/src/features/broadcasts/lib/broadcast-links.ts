/** The runs page of a repeating broadcast. */
export const broadcastRunsHref = (workspaceId: string, broadcastId: string) =>
  `/space/${workspaceId}/broadcasts/${broadcastId}/runs`

/** The broadcasts list with one broadcast's detail dialog open on it. */
export const broadcastDetailHref = (workspaceId: string, broadcastId: string) =>
  `/space/${workspaceId}/broadcasts?broadcastId=${broadcastId}`
