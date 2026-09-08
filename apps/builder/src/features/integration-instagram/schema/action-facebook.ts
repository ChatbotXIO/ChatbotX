import z from "zod"

/**
 * `workspaceId` and `version` never travel on the wire — the connect action
 * re-derives both from the encrypted pending-auth cookie via
 * `resolveConnectSession` (plan §2.4/§4.7), mirroring Messenger's
 * `selectPageRequest`. The operator's pick is the Instagram account id
 * alone; the action re-fetches the provider list itself.
 */
export const selectFacebookAccountRequest = z.object({
  igId: z.string().min(1),
})
