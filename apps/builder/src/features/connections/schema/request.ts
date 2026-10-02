import {
  channelTypes,
  connectionKinds,
  connectionStatuses,
  integrationTypes,
} from "@chatbotx.io/database/partials"
import { z } from "zod"

export const listConnectionsRequest = z.object({
  kind: connectionKinds.optional().describe("Filter by connection kind."),
  provider: integrationTypes
    .optional()
    .describe("Filter by provider (e.g. `whatsapp`, `claude`)."),
  channel: channelTypes
    .optional()
    .describe('Filter by channel type, for `kind: "channel"` connections.'),
  status: connectionStatuses
    .optional()
    .describe("Filter by connection status."),
})

export const getConnectionRequest = z.object({
  id: z.string().describe("Connection id. Get it from `connections.list`."),
})

export const listConnectionProvidersRequest = z.object({
  kind: connectionKinds.optional().describe("Filter by provider kind."),
})

export const createConnectionRequest = z.object({
  provider: integrationTypes.describe(
    "Provider to connect (e.g. `whatsapp`, `claude`). Call `connectionProviders.list` for the full catalog.",
  ),
  config: z
    .record(z.string(), z.unknown())
    .optional()
    .describe(
      "Credential-strategy config (e.g. an API key). See `connectionProviders.list`'s `configFields` for the provider's required shape. Ignored for an OAuth-strategy provider.",
    ),
  /** Where to send the browser once an OAuth connect session finishes (validated with `sanitizeReferer`). Ignored for a credential-strategy connect. */
  redirectUrl: z
    .url()
    .optional()
    .describe(
      "Where to send the browser once an OAuth connect session finishes. Ignored for a credential-strategy connect.",
    ),
})

export const reconnectConnectionRequest = z.object({
  id: z.string().describe("Connection id. Get it from `connections.list`."),
  redirectUrl: z
    .url()
    .optional()
    .describe(
      "Where to send the browser once the reconnect's OAuth round trip finishes.",
    ),
})

export const updateConnectionRequest = z.object({
  id: z.string().describe("Connection id. Get it from `connections.list`."),
  displayName: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .optional()
    .describe("New display name for the connection."),
})

export const getConnectSessionRequest = z.object({
  id: z
    .string()
    .describe(
      "Connect session id, returned as `session.id` by `connections.create`/`connections.reconnect`.",
    ),
})

export const connectSessionTargetsRequest = z.object({
  id: z
    .string()
    .describe(
      "Connect session id, returned as `session.id` by `connections.create`/`connections.reconnect`.",
    ),
  targetIds: z
    .array(z.string())
    .min(1)
    .describe(
      "Ids of the candidates to connect, from the session's `targets` list.",
    ),
})

export const submitConnectSessionInputRequest = z.object({
  id: z
    .string()
    .describe(
      "Connect session id, returned as `session.id` by `connections.create`/`connections.reconnect`.",
    ),
  input: z
    .record(z.string(), z.unknown())
    .describe(
      'Answer for the session\'s current `nextAction.type: "enter_input"` step.',
    ),
})
