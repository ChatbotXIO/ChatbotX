import type { DatabaseClient } from "@chatbotx.io/database/client"
import { and, db, eq } from "@chatbotx.io/database/client"
import type { IntegrationType } from "@chatbotx.io/database/partials"
import { integrationModel } from "@chatbotx.io/database/schema"
import { type AuthValue, authValueSchema, SdkException } from "@chatbotx.io/sdk"
import type { InferInsertModel, SQL } from "drizzle-orm"
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core"
import { buildConnectionStoreBindings } from "./store-bindings-channels"

type ConnectionStoreInsertInput =
  | {
      kind: "channel"
      workspaceId: string
      inboxId: string
      auth: AuthValue
      descriptor: { sourceId: string; displayName: string }
      config?: Record<string, unknown>
    }
  | {
      kind: "integration"
      workspaceId: string
      integrationId?: string
      auth: AuthValue
      descriptor: { sourceId: string; displayName: string }
      config?: Record<string, unknown>
    }

/**
 * Per-`IntegrationType` DB adapter the Connection domain drives instead of
 * each channel/integration hand-rolling insert/delete/lookup logic.
 */
export type ConnectionStoreBinding<TConfigColumn extends string = string> = {
  /**
   * Same read as `loadAuth`, keyed by the FK the `Connection` row actually
   * carries (`inboxId` for channels, `integrationId` for workspace
   * integrations) — `Connection` has no column pointing at the satellite
   * row's own primary key, so this is what `ConnectionService` (disconnect/
   * refresh/verify) uses to reach the row. `workspaceId` is an additional
   * required equality condition (defence-in-depth against cross-tenant
   * parameter confusion) — every call site already has the owning
   * `Connection` row's `workspaceId` in hand.
   */
  loadAuthByForeignKey: (
    foreignKey: string,
    workspaceId: string,
    tx?: DatabaseClient,
  ) => Promise<AuthValue>
  /**
   * Persists a refreshed auth value by the same FK as
   * {@link loadAuthByForeignKey} — used by `ConnectionService.refresh`'s
   * `AuthStore.save`, by `upsertConnectionRow`'s revive-in-place attempt
   * for a `connectFromCredentials({ allowUpdate: true })` call against an
   * already-active connection, and by `completeReconnect`'s OAuth-reconnect
   * revive attempt. `config`, when given, additionally updates the
   * satellite row's own extra columns through the same `configColumns`
   * allow-list `insertRow` enforces — e.g. replacing an AI provider's
   * `model`/`temperature` alongside its `apiKey` on a PUT update, not just
   * the auth column.
   *
   * Returns whether a row actually matched the FK and was updated — NOT
   * `void`. Revive/connect callers must insert a replacement row when this
   * returns `false`; refresh treats it as a failed auth persistence.
   */
  saveAuthByForeignKey: (
    foreignKey: string,
    workspaceId: string,
    auth: AuthValue,
    config?: Record<string, unknown>,
    tx?: DatabaseClient,
  ) => Promise<boolean>
  /**
   * `id` is always the satellite row's own PK. `integrationId` is also
   * populated for a workspace-integration binding (the parent `Integration`
   * row `insertRow` creates in the same transaction) — `Connection` has no
   * column pointing at a satellite's own PK, so `ConnectionService` needs
   * this to set `Connection.integrationId`. `undefined` for a channel
   * binding, whose FK is the caller-supplied `inboxId` it already has.
   */
  insertRow: (
    input: ConnectionStoreInsertInput,
    tx?: DatabaseClient,
  ) => Promise<{ id: string; integrationId?: string }>
  deleteRowByForeignKey: (
    foreignKey: string,
    workspaceId: string,
    tx?: DatabaseClient,
  ) => Promise<void>
  /** Unique-constraint name a duplicate insert violates — lets callers map it to `alreadyConnected` instead of a raw DB error. */
  duplicateConstraint?: string
  /**
   * Allow-list of extra satellite columns a credential-strategy `connect`
   * request may set via `config` beyond the provider's own `configFields`
   * (e.g. an AI provider's `model`/`temperature`/`maxOutputTokens`).
   * `connectFromCredentials` rejects any `config` key outside this list —
   * without it, a client could set an arbitrary satellite column (e.g.
   * `IntegrationApi.tokenHash`) via `config`. Undefined/empty for every
   * provider whose satellite row carries no additional client-settable
   * column.
   */
  configColumns?: readonly TConfigColumn[]
}

/**
 * `id` is excluded for every other channel binding (its PK rides
 * `identityColumn`/the table's own default instead), but WhatsApp's binding
 * deliberately allow-lists it — see its `CONNECTION_STORE_BINDINGS` entry
 * in `store-bindings-channels.ts` for why. `name` is likewise excluded by
 * default (`insertRow` always derives it from `descriptor.displayName`,
 * spread in after `safeConfig` so a client-supplied value there can never
 * win on insert), but Threads' binding deliberately allow-lists it so a
 * reconnect's `extraConfig` can refresh a stale display name through
 * `saveAuthByForeignKey`'s UPDATE path the same way it clears
 * `tokenRefreshError` — see its `CONNECTION_STORE_BINDINGS` entry in
 * `store-bindings-channels.ts`. Safe to widen here: `pickAllowed` still
 * gates on each binding's own `configColumns` array, so no other table is
 * affected unless it opts in the same way.
 */
type ConfigColumn<TTable extends PgTable> = Exclude<
  Extract<keyof InferInsertModel<TTable>, string>,
  "auth" | "encryptedAuth" | "inboxId" | "integrationId" | "workspaceId"
>

type WorkspaceConfigColumn<TTable extends PgTable> = Exclude<
  Extract<keyof InferInsertModel<TTable>, string>,
  "auth" | "encryptedAuth" | "id" | "integrationId" | "workspaceId"
>

/** Validates auth JSON read through Drizzle's erased generic column type. */
const asAuthValue = (value: unknown): AuthValue => {
  const parsedAuth = authValueSchema.safeParse(value)
  if (!parsedAuth.success) {
    throw new SdkException("Stored connection auth is invalid")
  }
  return parsedAuth.data
}

const pickAllowed = <TColumn extends string>(
  config: Record<string, unknown> | undefined,
  configColumns: readonly TColumn[] | undefined,
): Partial<Record<TColumn, unknown>> =>
  Object.fromEntries(
    Object.entries(config ?? {}).filter(([key]) =>
      configColumns?.includes(key as TColumn),
    ),
  ) as Partial<Record<TColumn, unknown>>

/**
 * Channel-satellite binding: a table with `id`, `workspaceId`, `inboxId`,
 * `auth`, `name`, and (usually) one natural external identity column. Covers
 * api/messenger/whatsapp/zalo/smtp/telegram/tiktok/webchat and the
 * instagram/instagramFacebook split over `IntegrationInstagram`.
 */
type ChannelSatelliteTable = PgTable & {
  id: AnyPgColumn
  auth: AnyPgColumn
  name: AnyPgColumn
  workspaceId: AnyPgColumn
  inboxId: AnyPgColumn
}

export const makeChannelBinding = <TTable extends ChannelSatelliteTable>(opts: {
  table: TTable
  tableName: string
  identityColumn: (Extract<keyof TTable, string> & string) | null
  onDisconnect: "delete_row" | "keep_row"
  duplicateConstraint?: string
  /** Extra fixed columns to set on insert (e.g. `IntegrationInstagram.type`). */
  extraInsertValues?: Record<string, unknown>
  /** Extra equality narrowing every read must apply (e.g. `type = 'instagram'`). */
  extraWhere?: Partial<Record<Extract<keyof TTable, string>, unknown>>
  /** See `ConnectionStoreBinding.configColumns`. */
  configColumns?: readonly ConfigColumn<TTable>[]
}): ConnectionStoreBinding<ConfigColumn<TTable>> => {
  const { table } = opts
  // `.from()`/`.insert()` reject a generic `TTable` param (Drizzle's typing
  // resolves them against the exact table's config, which a shared factory
  // spanning 15 distinct tables cannot express) — upcast once here; column
  // references below stay on the narrowed `table` for real type checking.
  const rawTable: PgTable = table
  // `identityColumn`, when set, is asserted to name a real text column on
  // `table`; there is no generic way to encode this across 15 distinct table
  // shapes, so the lookup uses a single documented cast.
  const identityCol = opts.identityColumn
    ? (table[opts.identityColumn as keyof TTable] as unknown as AnyPgColumn)
    : null
  // Narrows every read/write below to the caller's slice of a shared table
  // (e.g. `IntegrationInstagram.type = 'instagram'` vs `'facebook'`) — without
  // this, instagram and instagramFacebook bindings could load/overwrite/
  // delete each other's rows by `id`/`inboxId` collision on the shared table.
  const extraConditions = (): SQL[] =>
    Object.entries(opts.extraWhere ?? {}).map(([column, value]) =>
      eq(table[column as keyof TTable] as unknown as AnyPgColumn, value),
    )
  const withExtraWhere = (condition: SQL, workspaceId: string): SQL =>
    and(
      condition,
      eq(table.workspaceId, workspaceId),
      ...extraConditions(),
    ) as SQL

  return {
    loadAuthByForeignKey: async (inboxId, workspaceId, tx = db) => {
      const [row] = await tx
        .select({ auth: table.auth })
        .from(rawTable)
        .where(withExtraWhere(eq(table.inboxId, inboxId), workspaceId))
        .limit(1)
      if (!row) {
        throw new Error(
          `Unable to load auth for ${opts.tableName} inbox ${inboxId}`,
        )
      }
      return asAuthValue(row.auth)
    },
    saveAuthByForeignKey: async (
      inboxId,
      workspaceId,
      auth,
      config,
      tx = db,
    ) => {
      const safeConfig = pickAllowed<ConfigColumn<TTable>>(
        config,
        opts.configColumns,
      )
      const updated = await tx
        .update(table)
        .set({ ...safeConfig, auth } as InferInsertModel<TTable>)
        .where(withExtraWhere(eq(table.inboxId, inboxId), workspaceId))
        .returning({ id: table.id })
      return updated.length > 0
    },
    insertRow: async (input, tx = db) => {
      const identityValues = identityCol
        ? { [opts.identityColumn as string]: input.descriptor.sourceId }
        : {}
      if (input.kind !== "channel") {
        throw new Error(`${opts.tableName} requires a channel connection`)
      }
      const safeConfig = pickAllowed<ConfigColumn<TTable>>(
        input.config,
        opts.configColumns,
      )
      // `safeConfig` spreads first so no client-controlled key can clobber
      // the system columns set below — see `ConnectionStoreBinding.configColumns`.
      const values = {
        ...safeConfig,
        ...opts.extraInsertValues,
        workspaceId: input.workspaceId,
        inboxId: input.inboxId,
        auth: input.auth,
        name: input.descriptor.displayName,
        ...identityValues,
      }
      // Each channel table adds its own extra required/defaulted columns
      // beyond this shared shape (e.g. `IntegrationApi.tokenHash`), so the
      // generic factory cannot express the exact per-table insert type.
      const [row] = await tx
        .insert(table)
        .values(values as InferInsertModel<TTable>)
        .returning({ id: table.id })
      return { id: row.id as string }
    },
    deleteRowByForeignKey: async (inboxId, workspaceId, tx = db) => {
      if (opts.onDisconnect === "keep_row") {
        return
      }
      await tx
        .delete(rawTable)
        .where(withExtraWhere(eq(table.inboxId, inboxId), workspaceId))
    },
    duplicateConstraint: opts.duplicateConstraint,
    configColumns: opts.configColumns,
  }
}

/**
 * Workspace-level satellite binding: `insertRow` creates the parent
 * `Integration` row and the satellite row in one transaction. Satellites are
 * addressed by their parent `integrationId`, so they have no channel-style
 * identity column. Most providers have one integration per workspace;
 * `openaiCompatible` deliberately permits multiple rows.
 */
type WorkspaceSatelliteTable = PgTable & {
  id: AnyPgColumn
  workspaceId: AnyPgColumn
  integrationId: AnyPgColumn
}

export const makeWorkspaceIntegrationBinding = <
  TTable extends WorkspaceSatelliteTable,
>(opts: {
  table: TTable
  tableName: string
  integrationType: IntegrationType
  authColumn?: "auth" | "encryptedAuth"
  duplicateConstraint?: string
  /** Hydrates an auth value with the stored base URL for endpoint verification. */
  baseUrlColumn?: AnyPgColumn
  /** See `ConnectionStoreBinding.configColumns`. */
  configColumns?: readonly WorkspaceConfigColumn<TTable>[]
  /**
   * NOT NULL satellite columns the credential-strategy `connect` request's
   * own `configFields` never supply (e.g. a bare-`apiKey` AI provider's
   * `model`/`maxOutputTokens`) — applied before `safeConfig` so any value
   * the caller DID pass via `config` still wins. A function of the insert
   * input (not a static object) so a default can derive from the
   * connection descriptor (e.g. `openaiCompatible`'s `name` falling back
   * to `descriptor.displayName`).
   */
  defaultConfigValues?: (
    input: ConnectionStoreInsertInput,
  ) => Record<string, unknown>
}): ConnectionStoreBinding<WorkspaceConfigColumn<TTable>> => {
  const { table } = opts
  // `.from()`/`.insert()` reject a generic `TTable` param — see the same
  // note in `makeChannelBinding` above.
  const rawTable: PgTable = table
  const authColumnName = opts.authColumn ?? "auth"
  // Only `IntegrationMetaCatalog` names its auth column `encryptedAuth`;
  // every other satellite uses `auth`. The generic factory resolves whichever
  // one this table actually has via a single documented cast.
  const authColumn = table[
    authColumnName as keyof TTable
  ] as unknown as AnyPgColumn

  return {
    loadAuthByForeignKey: async (integrationId, workspaceId, tx = db) => {
      const [row] = await tx
        .select(
          opts.baseUrlColumn
            ? { auth: authColumn, baseURL: opts.baseUrlColumn }
            : { auth: authColumn },
        )
        .from(rawTable)
        .where(
          and(
            eq(table.integrationId, integrationId),
            eq(table.workspaceId, workspaceId),
          ),
        )
        .limit(1)
      if (!row) {
        throw new Error(
          `Unable to load auth for ${opts.tableName} integration ${integrationId}`,
        )
      }
      const auth = asAuthValue(row.auth)
      if (!("baseURL" in row) || typeof row.baseURL !== "string") {
        return auth
      }
      return { ...auth, baseURL: row.baseURL }
    },
    saveAuthByForeignKey: async (
      integrationId,
      workspaceId,
      auth,
      config,
      tx = db,
    ) => {
      const safeConfig = pickAllowed<WorkspaceConfigColumn<TTable>>(
        config,
        opts.configColumns,
      )
      const updated = await tx
        .update(table)
        .set({
          ...safeConfig,
          [authColumnName]: auth,
        } as InferInsertModel<TTable>)
        .where(
          and(
            eq(table.integrationId, integrationId),
            eq(table.workspaceId, workspaceId),
          ),
        )
        .returning({ id: table.id })
      return updated.length > 0
    },
    insertRow: async (input, tx) => {
      const safeConfig = pickAllowed<WorkspaceConfigColumn<TTable>>(
        input.config,
        opts.configColumns,
      )
      const run = async (client: DatabaseClient) => {
        const [parent] = await client
          .insert(integrationModel)
          .values({
            workspaceId: input.workspaceId,
            integrationType: opts.integrationType,
          })
          .returning({ id: integrationModel.id })
        // `defaultConfigValues` spreads first (lowest precedence) so a
        // caller-supplied `config` value in `safeConfig` always overrides
        // it; `safeConfig` itself spreads before the system columns below
        // so no client-controlled key can clobber those — see
        // `ConnectionStoreBinding.configColumns`.
        const values = {
          ...opts.defaultConfigValues?.(input),
          ...safeConfig,
          workspaceId: input.workspaceId,
          integrationId: parent.id,
          [authColumnName]: input.auth,
        }
        // Same per-table shape gap as `makeChannelBinding.insertRow` above.
        const [row] = await client
          .insert(table)
          .values(values as InferInsertModel<TTable>)
          .returning({ id: table.id })
        return { id: row.id as string, integrationId: parent.id as string }
      }
      return tx ? await run(tx) : await db.transaction((trx) => run(trx))
    },
    deleteRowByForeignKey: async (integrationId, workspaceId, tx = db) => {
      // Deletes the parent `Integration` row (not the satellite) so the
      // `onDelete: "cascade"` FK from every workspace-satellite table back
      // to `integrationModel.id` removes the satellite row too — mirrors
      // every legacy `*IntegrationService.disconnect` (e.g.
      // `integrationClaudeService.disconnect`), which deletes `Integration`
      // for the same reason: leaving the satellite's parent row behind
      // orphans it for `integrationService.hasIntegrationOfTypes`/
      // `listByWorkspaceId` and for every future reconnect.
      await tx
        .delete(integrationModel)
        .where(
          and(
            eq(integrationModel.id, integrationId),
            eq(integrationModel.workspaceId, workspaceId),
          ),
        )
    },
    duplicateConstraint: opts.duplicateConstraint,
    configColumns: opts.configColumns,
  }
}

export const CONNECTION_STORE_BINDINGS: Partial<
  Record<IntegrationType, ConnectionStoreBinding | null>
> = buildConnectionStoreBindings(
  makeChannelBinding,
  makeWorkspaceIntegrationBinding,
)
