import type { ConnectSessionModel } from "@chatbotx.io/database/types"
import type { ConnectSessionResource } from "../schema/resource"

/** Turns a `ConnectSession` row into its public/private DTO — never `encryptedAuth`/`claimedTargetIds`/`stateNonceHash`. */
export const toConnectSessionResource = (
  row: ConnectSessionModel,
): ConnectSessionResource => ({
  id: row.id,
  provider: row.provider,
  purpose: row.purpose,
  status: row.status,
  step: row.step,
  nextAction: row.nextAction ?? null,
  targets: row.targets,
  connectionIds: row.resultConnectionIds,
  errorCode: row.errorCode ?? null,
  expiresAt: row.expiresAt.toISOString(),
})
