import z from "zod"

/**
 * `workspaceId`/`version` never travel on the wire — the connect action
 * re-derives both from the `ConnectSession` row via `resolveConnectSession`,
 * mirroring Messenger's `selectPageRequest`. The operator's pick is the
 * session id plus the Instagram account id; the account itself comes from
 * `session.targets`, never a live re-fetch.
 */
export const selectFacebookAccountRequest = z.object({
  sessionId: z.string().min(1),
  igId: z.string().min(1),
})
