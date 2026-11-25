import type { AnyPgColumn } from "drizzle-orm/pg-core"
import { type SQL, sql } from "../../client"
import {
  integrationInstagramModel,
  integrationMessengerModel,
  integrationThreadsModel,
  publishDestinationModel,
} from "../../schema"

type InboxProvider = "facebook" | "instagram" | "threads"

/**
 * SQL for the sha256 (hex) of the access token stored in an integration's
 * `auth` (`auth.tokens.accessToken`, the same value for the three inbox
 * integrations). The publish pipeline computes the same digest in JS from the
 * row it read, so a status or error is only written while the token it was
 * learned with is still the stored one.
 */
export const tokenFingerprintSql = (auth: AnyPgColumn): SQL =>
  sql`encode(sha256(convert_to(${auth} #>> '{tokens,accessToken}', 'UTF8')), 'hex')`

const integrationOf = (provider: InboxProvider) => {
  switch (provider) {
    case "facebook":
      return integrationMessengerModel
    case "instagram":
      return integrationInstagramModel
    default:
      return integrationThreadsModel
  }
}

/**
 * `EXISTS` the inbox integration of the binding in `PublishDestination` whose
 * stored token has `fingerprint`, every table filtered by the workspace.
 */
export const inboxTokenMatches = (input: {
  fingerprint: string
  provider: InboxProvider
  workspaceId: string
}): SQL => {
  const integration = integrationOf(input.provider)
  return sql`EXISTS (
    SELECT 1 FROM ${integration}
    WHERE ${integration.inboxId} = ${publishDestinationModel.inboxId}
      AND ${integration.workspaceId} = ${publishDestinationModel.workspaceId}
      AND ${integration.workspaceId} = ${input.workspaceId}
      AND ${tokenFingerprintSql(integration.auth)} = ${input.fingerprint}
  )`
}
