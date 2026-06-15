import {
  and,
  type DatabaseClient,
  db,
  eq,
  isNull,
} from "@chatbotx.io/database/client"
import {
  type CredentialByType,
  type CredentialPublicByType,
  type CredentialType,
  credentialEncryptedSchema,
  credentialPublicSchemas,
  credentialSchemas,
} from "@chatbotx.io/database/partials"
import { platformCredentialModel } from "@chatbotx.io/database/schema"
import type { PlatformCredentialModel } from "@chatbotx.io/database/types"
import { encryptUtils } from "@chatbotx.io/encryption"
import { withCache } from "@chatbotx.io/redis"
import type { z } from "zod"
import { BaseService } from "../base.service"
import { tenantService } from "../enterprise/tenant/service"
import { logger } from "../logger"

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

class PlatformCredentialService extends BaseService {
  // ─── User-scoped ─────────────────────────────────────────────────────────────

  async findForUser<T extends CredentialType>(props: {
    userId: string
    type: T
    livemode?: boolean
    tx?: DatabaseClient
  }): Promise<CredentialRow<T> | undefined> {
    const { userId, type, livemode = false, tx = db } = props
    const row = await withCache(
      `cred:u:${userId}:${type}:${livemode}`,
      async () => {
        const [result] = await tx
          .select()
          .from(platformCredentialModel)
          .where(
            and(
              eq(platformCredentialModel.userId, userId),
              eq(platformCredentialModel.type, type),
              eq(platformCredentialModel.livemode, livemode),
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
    livemode?: boolean
    tx?: DatabaseClient
  }): Promise<DecryptedCredential<T> | undefined> {
    try {
      const row = await this.findForUser(props)
      if (!row) {
        return
      }
      return this._decrypt(row)
    } catch (err) {
      logger.error({ props, err }, "Failed to decrypt credential")
      return
    }
  }

  async upsertForUser<T extends CredentialType>(props: {
    userId: string
    type: T
    config: CredentialByType[T]
    livemode?: boolean
    usePlatformCredential?: boolean
    isVerified?: boolean
    verifiedAt?: Date | null
    tx?: DatabaseClient
  }): Promise<void> {
    const {
      userId,
      type,
      config,
      livemode = false,
      usePlatformCredential = false,
      isVerified = false,
      verifiedAt = null,
      tx = db,
    } = props
    const publicConfig = this._publicConfig(type, config)
    const aad = `user:${userId}:${type}:${livemode}`
    const value = await encryptUtils.encryptObject(config, aad)

    await tx
      .insert(platformCredentialModel)
      .values({
        userId,
        type,
        publicConfig,
        value,
        livemode,
        usePlatformCredential,
        isVerified,
        verifiedAt,
      })
      .onConflictDoUpdate({
        targetWhere: eq(platformCredentialModel.userId, userId),
        target: [
          platformCredentialModel.userId,
          platformCredentialModel.type,
          platformCredentialModel.livemode,
        ],
        set: {
          publicConfig,
          value,
          usePlatformCredential,
          isVerified,
          verifiedAt,
        },
      })

    await this.invalidateCacheTags(`cred:u:${userId}`)
  }

  async removeForUser(props: {
    userId: string
    type: CredentialType
    livemode?: boolean
    tx?: DatabaseClient
  }): Promise<void> {
    const { userId, type, livemode = false, tx = db } = props
    await tx
      .delete(platformCredentialModel)
      .where(
        and(
          eq(platformCredentialModel.userId, userId),
          eq(platformCredentialModel.type, type),
          eq(platformCredentialModel.livemode, livemode),
        ),
      )
    await this.invalidateCacheTags(`cred:u:${userId}`)
  }

  // ─── Platform-scoped (system / super-admin registers these) ─────────────────

  async findPlatform<T extends CredentialType>(props: {
    type: T
    livemode?: boolean
    tx?: DatabaseClient
  }): Promise<CredentialRow<T> | undefined> {
    const { type, livemode = false, tx = db } = props
    const row = await withCache(
      `cred:p:${type}:${livemode}`,
      async () => {
        const [result] = await tx
          .select()
          .from(platformCredentialModel)
          .where(
            and(
              isNull(platformCredentialModel.userId),
              eq(platformCredentialModel.type, type),
              eq(platformCredentialModel.livemode, livemode),
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
    livemode?: boolean
    tx?: DatabaseClient
  }): Promise<DecryptedCredential<T> | undefined> {
    try {
      const row = await this.findPlatform(props)
      if (!row) {
        return
      }
      return this._decrypt(row)
    } catch (err) {
      logger.error({ props, err }, "Failed to decrypt platform credential")
      return
    }
  }

  async upsertPlatform<T extends CredentialType>(props: {
    type: T
    config: CredentialByType[T]
    livemode?: boolean
    tx?: DatabaseClient
  }): Promise<void> {
    const { type, config, livemode = false, tx = db } = props
    const publicConfig = this._publicConfig(type, config)
    const aad = `platform:${type}:${livemode}`
    const value = await encryptUtils.encryptObject(config, aad)

    await tx
      .insert(platformCredentialModel)
      .values({ type, publicConfig, value, livemode })
      .onConflictDoUpdate({
        targetWhere: isNull(platformCredentialModel.userId),
        target: [
          platformCredentialModel.type,
          platformCredentialModel.livemode,
        ],
        set: { publicConfig, value },
      })

    await this.invalidateCacheTags(`cred:p:${type}`)
  }

  // ─── Scoped helpers (userId=undefined → platform-scoped) ────────────────────

  find<T extends CredentialType>(props: {
    userId: string | undefined
    type: T
    livemode?: boolean
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
    livemode?: boolean
    tx?: DatabaseClient
  }): Promise<DecryptedCredential<T> | undefined> {
    if (props.userId !== undefined) {
      return this.findDecryptedForUser({ ...props, userId: props.userId })
    }
    return this.findDecryptedPlatform(props)
  }

  upsert<T extends CredentialType>(props: {
    userId: string | undefined
    type: T
    config: CredentialByType[T]
    livemode?: boolean
    tx?: DatabaseClient
  }): Promise<void> {
    if (props.userId !== undefined) {
      return this.upsertForUser({ ...props, userId: props.userId })
    }
    return this.upsertPlatform(props)
  }

  // ─── Resolver: user → platform fallback ─────────────────────────────────────

  async resolveForUser<T extends CredentialType>(props: {
    userId: string
    type: T
    livemode?: boolean
    tx?: DatabaseClient
  }): Promise<DecryptedCredential<T> | undefined> {
    const { livemode = false } = props
    const userRow = await this.findForUser(props)

    if (userRow && !userRow.usePlatformCredential) {
      return this._decrypt(userRow)
    }

    return this.findDecryptedPlatform({
      type: props.type,
      livemode,
      tx: props.tx,
    })
  }

  async resolveForOwner<T extends CredentialType>(props: {
    ownerId: string
    type: T
    livemode?: boolean
    tx?: DatabaseClient
  }): Promise<DecryptedCredential<T> | undefined> {
    const setting = await tenantService.findByOwner(props.ownerId)
    const livemode = props.livemode ?? false

    if (setting?.status === "active") {
      const own = await this.findDecryptedForUser({
        userId: props.ownerId,
        type: props.type,
        livemode,
        tx: props.tx,
      })
      if (own) {
        return own
      }
    }

    // Reseller has no own credential (or tenant is inactive): fall back to the
    // platform-global default.
    return this.findDecryptedPlatform({
      type: props.type,
      livemode,
      tx: props.tx,
    })
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
    livemode?: boolean
    tx?: DatabaseClient
  }): Promise<
    | { publicConfig: CredentialPublicByType[T]; isInherited: boolean }
    | undefined
  > {
    const userRow = await this.findForUser(props)
    if (userRow && !userRow.usePlatformCredential) {
      return { publicConfig: userRow.publicConfig, isInherited: false }
    }

    const platformRow = await this.findPlatform({
      type: props.type,
      livemode: props.livemode,
      tx: props.tx,
    })
    if (platformRow) {
      return { publicConfig: platformRow.publicConfig, isInherited: true }
    }

    return
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

  private async _decrypt<T extends CredentialType>(
    row: CredentialRow<T>,
  ): Promise<DecryptedCredential<T>> {
    const blob = credentialEncryptedSchema.parse(row.value)
    const schema = credentialSchemas[row.type] as unknown as z.ZodType<
      CredentialByType[T]
    >
    const config = await encryptUtils.decryptObject(blob, schema)
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
