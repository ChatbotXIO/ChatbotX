import { z } from "zod"
import { connectLineRequest } from "./request"

/** UI form input: the public fields plus an optional target workspace. */
export const connectLineActionRequest = connectLineRequest.extend({
  workspaceId: z.string().nullish(),
})

export type ConnectLineActionRequest = z.infer<typeof connectLineActionRequest>

export const lineConnectErrorCodes = [
  "channelHidden",
  "connectionCredentialsRejected",
  "lineWebhookRejected",
  "connectionProviderUnavailable",
] as const

export type LineConnectErrorCode = (typeof lineConnectErrorCodes)[number]
