import { broadcastPrivateAPIs } from "./private"
import { broadcastWorkspaceTokenAPIs } from "./workspace-token"

export const broadcastAPIs = {
  ...broadcastWorkspaceTokenAPIs,
  ...broadcastPrivateAPIs,
}
