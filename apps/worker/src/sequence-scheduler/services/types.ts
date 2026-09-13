export type { DispatchWithRelations } from "@chatbotx.io/database/repositories"

export interface ConsumerConfig {
  groupId: string
  heartbeatInterval: number
  maxProcess: number
  maxWaitTimeInMs: number
  sessionTimeout: number
}

export type DispatchMessage = {
  dispatchId: string
  claimedAt: number
  bucket: number
  workspaceId: string
}

export type ValidationResult =
  | { valid: true }
  | { valid: false; reason: string }
