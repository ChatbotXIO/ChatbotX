import {
  and,
  asc,
  type DatabaseClient,
  db,
  eq,
  isNotNull,
  isNull,
  sql,
} from "@chatbotx.io/database/client"
import {
  type CredentialByType,
  type CredentialPublicByType,
  type CredentialType,
  credentialAadFor,
  credentialEncryptedSchema,
  credentialPublicSchemas,
  credentialSchemas,
} from "@chatbotx.io/database/partials"
import { connectionRepository } from "@chatbotx.io/database/repositories"
import { platformCredentialModel } from "@chatbotx.io/database/schema"
import type { PlatformCredentialModel } from "@chatbotx.io/database/types"
import { encryptUtils } from "@chatbotx.io/encryption"
import { withCache } from "@chatbotx.io/redis"
import type { z } from "zod"
import { BaseService } from "../base.service"
import { logger } from "../logger"
import { workspaceService } from "../workspace/service"
import { resolveCredentialOwnerIdForWorkspace } from "./owner"

type CredentialRow<T extends CredentialType> = Omit<
  PlatformCredentialModel,
  "type" | "publicConfig"
> & {
  type: T
  publicConfig: CredentialPublicByType[T]
}

type DecryptedCredential<T extends CredentialType> = {
  id: string
  userId: string | null
  type: T
  publicConfig: CredentialPublicByType[T]
  config: CredentialByType[T]
  createdAt: Date
  updatedAt: Date
}

const readClientId = (config: unknown): string | undefined =>
  typeof config === "object" &&
  config !== null &&
  "clientId" in config &&
  typeof config.clientId === "string" &&
  config.clientId.length > 0
    ? config.clientId
    : undefined

export type MetaAppCredentialType = Extract<
  CredentialType,
  "messenger" | "instagram" | "instagramFacebook" | "threads"
>

class PlatformCredentialService extends BaseService {
  // ─── User-scoped ─────────────────────────────────────────────────────────────

  async findForUser<T extends CredentialType>(props: {
    userId: string
    type: T
    tx?: DatabaseClient
  }): Promise<CredentialRow<T> | undefined> {
    const { userId, type, tx = db } = props
    const row = await withCache(
      `cred:u:${userId}:${type}`,
      async () => {
        const [result] = await tx
          .select()
          .from(platformCredentialModel)
          .where(
            and(
              eq(platformCredentialModel.userId, userId),
              eq(platformCredentialModel.type, type),
            ),
          )
          .limit(1)
        return result
      },
      {
        tags: [`cred:u:${userId}`],
      },
    )
    return row as CredentialRow<T> | undefined
  }

  async findDecryptedForUser<T extends CredentialType>(props: {
    userId: string
    type: T
    tx?: DatabaseClient
    /** Ignore a stored row when its owner selected platform delegation. */
    requireOwnCredential?: boolean
    /** Rethrow DB/decrypt failures instead of reporting "no credential". */
    strict?: boolean
  }): Promise<DecryptedCredential<T> | undefined> {
    try {
      const row = await this.findForUser(props)
      if (!row || (props.requireOwnCredential && row.usePlatformCredential)) {
        return
      }
      // Awaited so a decrypt failure lands in the catch below instead of escaping it.
      return await this._decrypt(row)
    } catch (err) {
      if (props.strict) {
        throw err
      }
      logger.error({ props, err }, "Failed to decrypt credential")
      return
    }
  }

  /**
   * Resolves an explicitly addressed, user-owned credential for an inbound
   * broker webhook. It intentionally never follows a platform delegation.
   */
  async findDecryptedForWebhook<T extends CredentialType>(props: {
    id: string
    type: T
  }): Promise<DecryptedCredential<T> | undefined> {
    const [row] = await db
      .select()
      .from(platformCredentialModel)
      .where(
        and(
          eq(platformCredentialModel.id, props.id),
          eq(platformCredentialModel.type, props.type),
          isNotNull(platformCredentialModel.userId),
          eq(platformCredentialModel.usePlatformCredential, false),
        ),
      )
      .limit(1)
    return row ? this._decrypt(row as CredentialRow<T>) : undefined
  }

  async upsertForUser<T extends CredentialType>(props: {
    id?: string
    userId: string
    type: T
    config: CredentialByType[T]
    usePlatformCredential?: boolean
    isVerified?: boolean
    verifiedAt?: Date | null
    tx?: DatabaseClient
  }): Promise<{ id: string }> {
    const {
      id,
      userId,
      type,
      config,
      usePlatformCredential = false,
      isVerified = false,
      verifiedAt = null,
      tx = db,
    } = props
    const publicConfig = this._publicConfig(type, config)
    const aad = credentialAadFor({ userId, type })
    const value = await encryptUtils.encryptObject(config, aad)

    const [credential] = await tx
      .insert(platformCredentialModel)
      .values({
        ...(id ? { id } : {}),
        userId,
        type,
        publicConfig,
        value,
        usePlatformCredential,
        isVerified,
        verifiedAt,
      })
      .onConflictDoUpdate({
        targetWhere: eq(platformCredentialModel.userId, userId),
        target: [platformCredentialModel.userId, platformCredentialModel.type],
        set: {
          publicConfig,
          value,
          usePlatformCredential,
          isVerified,
          verifiedAt,
        },
      })
      .returning({ id: platformCredentialModel.id })

    if (!credential) {
      throw new Error("Failed to upsert platform credential")
    }

    await this.invalidateCacheTags(`cred:u:${userId}`)
    return credential
  }

  async removeForUser(props: {
    userId: string
    type: CredentialType
    tx?: DatabaseClient
  }): Promise<void> {
    const { userId, type, tx = db } = props
    await tx
      .delete(platformCredentialModel)
      .where(
        and(
          eq(platformCredentialModel.userId, userId),
          eq(platformCredentialModel.type, type),
        ),
      )
    await this.invalidateCacheTags(`cred:u:${userId}`)
  }

  // ─── Platform-scoped (system / super-admin registers these) ─────────────────

  async findPlatform<T extends CredentialType>(props: {
    type: T
    tx?: DatabaseClient
  }): Promise<CredentialRow<T> | undefined> {
    const { type, tx = db } = props
    const row = await withCache(
      `cred:p:${type}`,
      async () => {
        const [result] = await tx
          .select()
          .from(platformCredentialModel)
          .where(
            and(
              isNull(platformCredentialModel.userId),
              eq(platformCredentialModel.type, type),
            ),
          )
          .limit(1)
        return result
      },
      {
        tags: [`cred:p:${type}`],
      },
    )
    return row as CredentialRow<T> | undefined
  }

  async findDecryptedPlatform<T extends CredentialType>(props: {
    type: T
    tx?: DatabaseClient
    /** Rethrow DB/decrypt failures instead of reporting "no credential". */
    strict?: boolean
  }): Promise<DecryptedCredential<T> | undefined> {
    try {
      const row = await this.findPlatform(props)
      if (!row) {
        return
      }
      // Awaited so a decrypt failure lands in the catch below instead of escaping it.
      return await this._decrypt(row)
    } catch (err) {
      if (props.strict) {
        throw err
      }
      logger.error({ props, err }, "Failed to decrypt platform credential")
      return
    }
  }

  async findDecryptedThreadsByClientId(props: {
    clientId: string
    tx?: DatabaseClient
  }): Promise<DecryptedCredential<"threads"> | undefined> {
    const { clientId, tx = db } = props

    try {
      const [row] = await tx
        .select()
        .from(platformCredentialModel)
        .where(
          and(
            eq(platformCredentialModel.type, "threads"),
            eq(platformCredentialModel.usePlatformCredential, false),
            sql`${platformCredentialModel.publicConfig}->>'clientId' = ${clientId}`,
          ),
        )
        .orderBy(
          sql`CASE WHEN ${platformCredentialModel.userId} IS NULL THEN 0 ELSE 1 END`,
          asc(platformCredentialModel.userId),
          asc(platformCredentialModel.id),
        )
        .limit(1)

      if (!row) {
        return
      }

      // Awaited so a decrypt failure lands in the catch below instead of escaping it.
      return await this._decrypt(row as CredentialRow<"threads">)
    } catch (err) {
      logger.error(
        { clientId, err, type: "threads" },
        "Failed to resolve threads credential by clientId",
      )
      return
    }
  }

  async resolvePlatformAppAccessToken(
    type: MetaAppCredentialType,
  ): Promise<string | undefined> {
    const credential = await this.findDecryptedPlatform({ type })

    if (!credential) {
      return
    }

    return `${credential.config.clientId}|${credential.config.clientSecret}`
  }

  async upsertPlatform<T extends CredentialType>(props: {
    type: T
    config: CredentialByType[T]
    tx?: DatabaseClient
  }): Promise<{ id: string }> {
    const { type, config, tx = db } = props
    const publicConfig = this._publicConfig(type, config)
    const aad = credentialAadFor({ userId: null, type })
    const value = await encryptUtils.encryptObject(config, aad)

    const [credential] = await tx
      .insert(platformCredentialModel)
      .values({ type, publicConfig, value })
      .onConflictDoUpdate({
        targetWhere: isNull(platformCredentialModel.userId),
        target: [platformCredentialModel.type],
        set: { publicConfig, value },
      })
      .returning({ id: platformCredentialModel.id })

    if (!credential) {
      throw new Error("Failed to upsert platform credential")
    }

    await this.invalidateCacheTags(`cred:p:${type}`)
    return credential
  }

  async removePlatform(props: {
    type: CredentialType
    tx?: DatabaseClient
  }): Promise<void> {
    const { type, tx = db } = props
    await tx
      .delete(platformCredentialModel)
      .where(
        and(
          isNull(platformCredentialModel.userId),
          eq(platformCredentialModel.type, type),
        ),
      )
    await this.invalidateCacheTags(`cred:p:${type}`)
  }

  // ─── Scoped helpers (userId=undefined → platform-scoped) ────────────────────

  find<T extends CredentialType>(props: {
    userId: string | undefined
    type: T
    tx?: DatabaseClient
  }): Promise<CredentialRow<T> | undefined> {
    if (props.userId !== undefined) {
      return this.findForUser({ ...props, userId: props.userId })
    }
    return this.findPlatform(props)
  }

  findDecrypted<T extends CredentialType>(props: {
    userId: string | undefined
    type: T
    tx?: DatabaseClient
    /** Rethrow DB/decrypt failures instead of reporting "no credential". */
    strict?: boolean
  }): Promise<DecryptedCredential<T> | undefined> {
    if (props.userId !== undefined) {
      return this.findDecryptedForUser({ ...props, userId: props.userId })
    }
    return this.findDecryptedPlatform(props)
  }

  upsert<T extends CredentialType>(props: {
    id?: string
    userId: string | undefined
    type: T
    config: CredentialByType[T]
    tx?: DatabaseClient
  }): Promise<{ id: string }> {
    if (props.userId !== undefined) {
      return this.upsertForUser({ ...props, userId: props.userId })
    }
    return this.upsertPlatform(props)
  }

  remove(props: {
    userId: string | undefined
    type: CredentialType
    tx?: DatabaseClient
  }): Promise<void> {
    if (props.userId !== undefined) {
      return this.removeForUser({ ...props, userId: props.userId })
    }
    return this.removePlatform(props)
  }

  // ─── Resolver: user → platform fallback ─────────────────────────────────────

  async resolveForOwner<T extends CredentialType>(props: {
    ownerId: string
    type: T
    tx?: DatabaseClient
    /** Rethrow DB/decrypt failures instead of falling back / reporting "no credential". */
    strict?: boolean
  }): Promise<DecryptedCredential<T> | undefined> {
    try {
      const ownRow = await this.findForUser({
        userId: props.ownerId,
        type: props.type,
        tx: props.tx,
      })
      if (ownRow && !ownRow.usePlatformCredential) {
        return await this._decrypt(ownRow)
      }
    } catch (err) {
      if (props.strict) {
        throw err
      }
      logger.error({ props, err }, "Failed to resolve own credential")
      return
    }

    // Existing user-owned credentials are grandfathered after an entitlement
    // downgrade. New writes remain gated at the action boundary.
    return this.findDecryptedPlatform({
      type: props.type,
      tx: props.tx,
      strict: props.strict,
    })
  }

  /**
   * The provider app a stored connection must keep using. Prefers the
   * credential the connection pinned at connect time; a connection without a
   * pin (made before pins existed, or its credential was deleted) falls back
   * to the current tenant-first owner lookup. Either way the app is verified
   * against `storedClientId` (the app id recorded in the connection's auth):
   * a mismatch returns no credential rather than a different app, so a
   * changed or replaced app can never be used for another app's tokens.
   * Callers degrade (stored flags, connect token only) on `undefined`.
   */
  async resolveForConnection<T extends CredentialType>(props: {
    connection: { id: string; platformCredentialId?: string | null }
    workspace: { id: string; ownerId: string; tenantId: string }
    type: T
    storedClientId?: string | null
    tx?: DatabaseClient
  }): Promise<DecryptedCredential<T> | undefined> {
    const { connection, workspace, type, storedClientId } = props
    const pinned = connection.platformCredentialId
      ? await this.findDecryptedById({
          id: connection.platformCredentialId,
          type,
          tx: props.tx,
        })
      : undefined
    const credential =
      pinned ??
      (await this.resolveForOwner({
        ownerId: await resolveCredentialOwnerIdForWorkspace(
          workspace.id,
          workspace,
        ),
        type,
        tx: props.tx,
      }))

    if (!credential) {
      logger.warn(
        { connectionId: connection.id, type, cause: "no-credential" },
        "No platform credential for connection",
      )
      return
    }
    const currentClientId = readClientId(credential.config)
    if (storedClientId && currentClientId !== storedClientId) {
      logger.warn(
        {
          connectionId: connection.id,
          type,
          cause: pinned ? "pinned-app-changed" : "app-mismatch",
        },
        "Platform credential app differs from the connection's app",
      )
      return
    }
    return credential
  }

  /**
   * `resolveForConnection` for a connection addressed by its channel inbox
   * (what the integration rows and the worker hold). `integrationAuth` is the
   * integration's stored auth; its `clientId`, when it has one, identifies the
   * app the tokens belong to.
   */
  async resolveForInbox<T extends CredentialType>(props: {
    workspaceId: string
    inboxId: string | null | undefined
    integrationAuth: unknown
    type: T
    tx?: DatabaseClient
  }): Promise<DecryptedCredential<T> | undefined> {
    const connection = props.inboxId
      ? await connectionRepository.findByInboxId(
          { inboxId: props.inboxId },
          props.tx,
        )
      : undefined
    const workspace = await workspaceService.findById({
      id: props.workspaceId,
      tx: props.tx,
    })
    return await this.resolveForConnection({
      connection: connection ?? {
        id: `inbox:${props.inboxId ?? "unknown"}`,
        platformCredentialId: null,
      },
      workspace,
      type: props.type,
      storedClientId: readClientId(props.integrationAuth),
      tx: props.tx,
    })
  }

  /** One keyset page of a provider's connections with no credential pin (for the pin backfill). */
  async listUnpinnedConnections(props: {
    provider: Parameters<
      typeof connectionRepository.listUnpinnedByProvider
    >[0]["provider"]
    afterId?: string | null
    workspaceId?: string | null
    limit: number
  }) {
    return await connectionRepository.listUnpinnedByProvider(props)
  }

  /** Pins a connection to a credential only while it has no pin. Returns whether it was written. */
  async pinConnectionIfUnset(props: {
    connectionId: string
    workspaceId: string
    platformCredentialId: string
  }): Promise<boolean> {
    return await connectionRepository.pinCredentialIfUnset({
      id: props.connectionId,
      workspaceId: props.workspaceId,
      platformCredentialId: props.platformCredentialId,
    })
  }

  /**
   * The app a reconnect of an inbox's connection starts with: the pinned one
   * while it still exists, otherwise the tenant-first owner's. The caller
   * writes the returned credential's id as the connection's new pin together
   * with the new auth.
   */
  async resolveForReconnect<T extends CredentialType>(props: {
    workspace: { id: string; ownerId: string; tenantId: string }
    inboxId: string
    type: T
    tx?: DatabaseClient
  }): Promise<DecryptedCredential<T> | undefined> {
    const connection = await connectionRepository.findByInboxId(
      { inboxId: props.inboxId },
      props.tx,
    )
    const pinned = connection?.platformCredentialId
      ? await this.findDecryptedById({
          id: connection.platformCredentialId,
          type: props.type,
          tx: props.tx,
        })
      : undefined
    return (
      pinned ??
      (await this.resolveForOwner({
        ownerId: await resolveCredentialOwnerIdForWorkspace(
          props.workspace.id,
          props.workspace,
        ),
        type: props.type,
        tx: props.tx,
      }))
    )
  }

  /**
   * The agency **System User** access token from the owner's WhatsApp platform
   * credential. Used to create WhatsApp assets (e.g. CAPI datasets) on behalf
   * of a client WABA so Meta attributes the dataset "Creator" to the business
   * system user instead of the personal user who connected the integration —
   * the embedded-signup flow already grants this system user access to the WABA
   * (`addSystemUser`). Returns `null` when the owner has no WhatsApp credential,
   * so callers can fall back to the connecting user's token and never break
   * provisioning.
   */
  async resolveWhatsappSystemUserToken(props: {
    ownerId: string
    tx?: DatabaseClient
  }): Promise<string | null> {
    const credential = await this.resolveForOwner({
      ownerId: props.ownerId,
      type: "whatsapp",
      tx: props.tx,
    })

    return credential?.config.systemUserToken ?? null
  }

  /**
   * Resolve the public (non-secret) credential config for a user, falling back
   * to the platform-global default when the user has not configured their own.
   * Used by the manage UI so a reseller sees the credential their workspaces
   * actually inherit. `isInherited` is `true` when the returned config is the
   * platform default rather than the user's own.
   */
  async resolvePublicForUser<T extends CredentialType>(props: {
    userId: string
    type: T
    tx?: DatabaseClient
  }): Promise<
    | {
        credentialId?: string
        publicConfig: CredentialPublicByType[T]
        isInherited: boolean
      }
    | undefined
  > {
    const userRow = await this.findForUser(props)
    if (userRow && !userRow.usePlatformCredential) {
      return {
        credentialId: userRow.id,
        publicConfig: await this._publicWithDerivedFlags(userRow),
        isInherited: false,
      }
    }

    const platformRow = await this.findPlatform({
      type: props.type,
      tx: props.tx,
    })
    if (platformRow) {
      return {
        publicConfig: await this._publicWithDerivedFlags(platformRow),
        isInherited: true,
      }
    }

    return
  }

  /**
   * Public (non-secret) config of the platform-global credential for the admin
   * view. Unlike `findPlatform(...).publicConfig`, flags that older rows never
   * persisted are derived at read time (see `_publicWithDerivedFlags`).
   */
  async findPlatformPublic<T extends CredentialType>(props: {
    type: T
    tx?: DatabaseClient
  }): Promise<CredentialPublicByType[T] | undefined> {
    const row = await this.findPlatform(props)
    return row ? this._publicWithDerivedFlags(row) : undefined
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private _publicConfig<T extends CredentialType>(
    type: T,
    config: CredentialByType[T],
  ): CredentialPublicByType[T] {
    const schema = credentialPublicSchemas[type] as unknown as z.ZodType<
      CredentialPublicByType[T]
    >
    return schema.parse(config)
  }

  /**
   * Rows saved before `hasDeveloperToken` existed lack the flag in their stored
   * `publicConfig` even though the encrypted value holds a token. For googleAds
   * rows missing it, decrypt server-side and derive the boolean. The secret
   * itself never leaves this method.
   */
  private async _publicWithDerivedFlags<T extends CredentialType>(
    row: CredentialRow<T>,
  ): Promise<CredentialPublicByType[T]> {
    const stored = row.publicConfig
    if (
      row.type !== "googleAds" ||
      typeof (stored as { hasDeveloperToken?: unknown }).hasDeveloperToken ===
        "boolean"
    ) {
      return stored
    }
    try {
      const { config } = await this._decrypt(row)
      const hasDeveloperToken = Boolean(
        (config as { developerToken?: string }).developerToken,
      )
      return { ...stored, hasDeveloperToken } as CredentialPublicByType[T]
    } catch (err) {
      logger.error(
        { err, credentialId: row.id },
        "Failed to derive credential public flags",
      )
      return stored
    }
  }

  /**
   * One credential by id, decrypted — for a resource that remembers which
   * credential it was made with (a Stripe Connect store, a webhook URL).
   * Undefined when it is gone or of another type.
   */
  async findDecryptedById<T extends CredentialType>(props: {
    id: string
    type: T
    tx?: DatabaseClient
  }): Promise<DecryptedCredential<T> | undefined> {
    const { tx = db } = props
    const [row] = await tx
      .select()
      .from(platformCredentialModel)
      .where(
        and(
          eq(platformCredentialModel.id, props.id),
          eq(platformCredentialModel.type, props.type),
        ),
      )
      .limit(1)
    if (!row) {
      return
    }
    return await this._decrypt(row as CredentialRow<T>)
  }

  private async _decrypt<T extends CredentialType>(
    row: CredentialRow<T>,
  ): Promise<DecryptedCredential<T>> {
    const blob = credentialEncryptedSchema.parse(row.value)
    const schema = credentialSchemas[row.type] as unknown as z.ZodType<
      CredentialByType[T]
    >
    const config = await encryptUtils.decryptObject(
      blob,
      schema,
      credentialAadFor(row),
    )
    return {
      id: row.id,
      userId: row.userId ?? null,
      type: row.type,
      publicConfig: row.publicConfig as CredentialPublicByType[T],
      config,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }
}

export const platformCredentialService = new PlatformCredentialService()
