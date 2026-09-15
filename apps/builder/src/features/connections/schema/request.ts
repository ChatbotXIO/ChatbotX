import {
  channelTypes,
  connectionKinds,
  connectionStatuses,
  integrationTypes,
} from "@chatbotx.io/database/partials"
import { z } from "zod"

export const listConnectionsRequest = z.object({
  kind: connectionKinds.optional(),
  provider: integrationTypes.optional(),
  channel: channelTypes.optional(),
  status: connectionStatuses.optional(),
})

export const getConnectionRequest = z.object({
  id: z.string(),
})

export const listConnectionProvidersRequest = z.object({
  kind: connectionKinds.optional(),
})

export const createConnectionRequest = z.object({
  provider: integrationTypes,
  config: z.record(z.string(), z.unknown()).optional(),
  /** Where to send the browser once an OAuth connect session finishes (validated with `sanitizeReferer`). Ignored for a credential-strategy connect. */
  redirectUrl: z.url().optional(),
})

export const reconnectConnectionRequest = z.object({
  id: z.string(),
  redirectUrl: z.url().optional(),
})

export const updateConnectionRequest = z.object({
  id: z.string(),
  displayName: z.string().trim().min(1).max(200),
})

export const getConnectSessionRequest = z.object({
  id: z.string(),
})

export const connectSessionTargetsRequest = z.object({
  id: z.string(),
  targetIds: z.array(z.string()).min(1),
})

export const submitConnectSessionInputRequest = z.object({
  id: z.string(),
  input: z.record(z.string(), z.unknown()),
})
