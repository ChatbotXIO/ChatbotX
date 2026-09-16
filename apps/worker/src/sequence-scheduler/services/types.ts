export type { DispatchWithRelations } from "@chatbotx.io/database/repositories"

export type DispatchMessage = {
  dispatchId: string
  claimedAt: number
  bucket: number
  workspaceId: string
}
