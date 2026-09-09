import { type DatabaseClient, db, sql } from "../../client"

/**
 * Raw row shape for a dynamic per-channel integration table lookup. Callers
 * (worker `IntegrationRow`) narrow `auth` to their own `AuthValue` type —
 * this repository stays free of the `@chatbotx.io/sdk` dependency that
 * `packages/database` does not carry.
 */
export type IntegrationLookupRow = {
  id: string
  auth: unknown
  workspaceId?: string
  inboxId: string
  [x: string]: unknown
}

/**
 * Dynamic-table integration lookups keyed on an external identifier or an
 * inbox id. `modelName`/`columnName`/`integrationTable` are always the
 * output of an exhaustive `switch` in the caller (never raw user input) —
 * `sql.identifier()` is the injection guard here and MUST be kept on both
 * queries.
 */
export const integrationLookupRepository = {
  async findAuthByIdentifier(
    props: { modelName: string; columnName: string; identifier: string },
    tx: DatabaseClient = db,
  ): Promise<IntegrationLookupRow | undefined> {
    const result = await tx.execute<IntegrationLookupRow>(
      sql`SELECT * FROM ${sql.identifier(props.modelName)} WHERE ${sql.identifier(props.columnName)} = ${props.identifier} LIMIT 1`,
    )
    return result.rows[0]
  },

  async findAuthByInboxId(
    props: { modelName: string; inboxId: string },
    tx: DatabaseClient = db,
  ): Promise<IntegrationLookupRow | undefined> {
    const result = await tx.execute<IntegrationLookupRow>(
      sql`SELECT * FROM ${sql.identifier(props.modelName)} WHERE "inboxId" = ${props.inboxId} LIMIT 1`,
    )
    return result.rows[0]
  },
}
