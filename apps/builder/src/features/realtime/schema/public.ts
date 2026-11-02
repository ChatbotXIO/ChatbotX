import { z } from "zod"

export const realtimeConnectTokenResponse = z.object({
  token: z
    .string()
    .describe(
      "Connect token, valid 60 seconds. Mint a new one on every (re)connect.",
    ),
  url: z
    .string()
    .describe(
      "Realtime base URL (`publicRealtimeUrl`, e.g. https://host/ws/) for this workspace's tenant.",
    ),
  socketUrl: z
    .string()
    .describe(
      "Ready-to-use WebSocket endpoint without query: wss://host/ws/rt/workspaces/<workspaceId>. Append `?token=<token>&lastSeq=<seq>`.",
    ),
})
