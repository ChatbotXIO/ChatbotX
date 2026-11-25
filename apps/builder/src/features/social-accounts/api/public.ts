import {
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnUsingSocialAccount,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { socialAccountOperations } from "../lib/social-account-operations"
import {
  listSocialAccountsResponse,
  socialAccountIdRequest,
  socialAccountResource,
} from "../schema"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("posts")
const tags = ["Social accounts"]

/**
 * Connecting an account is not here on purpose: it is a browser redirect through
 * the network's login dialog (the OAuth step is on invariant 23's exempt list).
 * Disconnecting is here: invariant 23 says the post-connect read/settings/
 * disconnect still need an API. The UI limits it to a workspace super admin; a
 * workspace token has no role, only a scope, so the `posts` scope stands in.
 */
export const socialAccountsPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/social-accounts",
      summary: "List social accounts",
      description:
        "Lists the TikTok publishing logins (TikTok publishes through its own app; Facebook, Instagram and Threads publish with their inbox and are listed by `publishDestinations.list`) with their destinations, status, the permissions still missing and the content types accepted. Tokens are never returned. An account in `needsReauth` must be reconnected by a workspace super admin from the Posts page.",
      tags,
    })
    .output(listSocialAccountsResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context }) => ({
      items: await socialAccountOperations.list(context.workspace.id),
    })),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/social-accounts/{id}",
      summary: "Get social account",
      description:
        "Returns one connected account with its destinations and status. Get the id from `socialAccounts.list`.",
      tags,
    })
    .input(socialAccountIdRequest)
    .output(socialAccountResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await socialAccountOperations.get({
          id: input.id,
          workspaceId: context.workspace.id,
        }),
    ),

  verify: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/social-accounts/{id}/verify",
      summary: "Verify social account",
      description:
        "Calls the platform to prove the stored token still works and to read the permissions it grants. A rejected token or a missing publishing permission moves the account to `needsReauth`; a working token clears it. A platform outage leaves the status unchanged and answers 502 `providerUnavailable`.",
      tags,
    })
    .input(socialAccountIdRequest)
    .output(socialAccountResource)
    .errors(possibleErrorsOnUsingSocialAccount)
    .handler(
      async ({ context, input }) =>
        await socialAccountOperations.verify({
          id: input.id,
          workspaceId: context.workspace.id,
        }),
    ),

  syncDestinations: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/social-accounts/{id}/sync-destinations",
      summary: "Sync social account destinations",
      description:
        "A TikTok login owns one profile, so nothing changes and the account is returned as is.",
      tags,
    })
    .input(socialAccountIdRequest)
    .output(socialAccountResource)
    .errors(possibleErrorsOnUsingSocialAccount)
    .handler(
      async ({ context, input }) =>
        await socialAccountOperations.syncDestinations({
          id: input.id,
          workspaceId: context.workspace.id,
        }),
    ),

  disconnect: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/social-accounts/{id}",
      summary: "Disconnect social account",
      description:
        "Disconnects a TikTok publishing login: the stored tokens are removed and posts that targeted it can no longer publish there. Get the id from `socialAccounts.list`. Reconnecting needs the browser login dialog.",
      successStatus: 204,
      tags,
    })
    .input(socialAccountIdRequest)
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await socialAccountOperations.disconnect({
        id: input.id,
        workspaceId: context.workspace.id,
      })
    }),
}
