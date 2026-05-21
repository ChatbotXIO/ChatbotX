import { type DatabaseClient, db } from "@chatbotx.io/database/client"
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
import { and, eq, isNull } from "drizzle-orm"
import type { z } from "zod"
import { BaseService } from "../base.service"

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

class CredentialService extends BaseService {
  // ─── User-scoped ─────────────────────────────────────────────────────────────

  async findForUser<T extends CredentialType>(props: {
    userId: string
    type: T
    livemode?: boolean
    tx?: DatabaseClient
  }): Promise<CredentialRow<T> | undefined> {
    const { userId, type, livemode = false, tx = db } = props
    const row = await withCache(
      `credentials:${userId}:${type}:${livemode}`,
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
        dynamicTags: (cached) =>
          cached
            ? [`credentials:${userId}`, `credentials:${userId}:${type}`]
            : undefined,
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
    const row = await this.findForUser(props)
    if (!row) {
      return
    }
    const { userId, type, livemode = false } = props
    return this._decrypt(row, `user:${userId}:${type}:${livemode}`)
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

    await this.invalidateCacheTags([
      `credentials:${userId}:${type}`,
      `credentials:${userId}:${type}:${livemode}`,
    ])
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
    await this.invalidateCacheTags([
      `credentials:${userId}:${type}`,
      `credentials:${userId}:${type}:${livemode}`,
    ])
  }

  // ─── Platform-scoped (system / super-admin registers these) ─────────────────

  async findPlatform<T extends CredentialType>(props: {
    type: T
    livemode?: boolean
    tx?: DatabaseClient
  }): Promise<CredentialRow<T> | undefined> {
    const { type, livemode = false, tx = db } = props
    const row = await withCache(
      `credentials:platform:${type}:${livemode}`,
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
        dynamicTags: (cached) =>
          cached
            ? [
                `credentials:platform:${type}`,
                `credentials:platform:${type}:${livemode}`,
              ]
            : undefined,
      },
    )
    return row as CredentialRow<T> | undefined
  }

  async findDecryptedPlatform<T extends CredentialType>(props: {
    type: T
    livemode?: boolean
    tx?: DatabaseClient
  }): Promise<DecryptedCredential<T> | undefined> {
    const row = await this.findPlatform(props)
    if (!row) {
      return
    }
    const { type, livemode = false } = props
    return this._decrypt(row, `platform:${type}:${livemode}`)
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

    await this.invalidateCacheTags([
      `credentials:platform:${type}`,
      `credentials:platform:${type}:${livemode}`,
    ])
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
      return this._decrypt(
        userRow,
        `user:${props.userId}:${props.type}:${livemode}`,
      )
    }

    return this.findDecryptedPlatform({
      type: props.type,
      livemode,
      tx: props.tx,
    })
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
    aad: string,
  ): Promise<DecryptedCredential<T>> {
    const blob = credentialEncryptedSchema.parse(row.value)
    const schema = credentialSchemas[row.type] as unknown as z.ZodType<
      CredentialByType[T]
    >
    const config = await encryptUtils.decryptObject(blob, schema, aad)
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

export const credentialService = new CredentialService()
