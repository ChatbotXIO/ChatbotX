import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import {
  type OrganizationCredentialByType,
  type OrganizationCredentialPublicByType,
  type OrganizationCredentialType,
  organizationCredentialEncryptedSchema,
  organizationCredentialPublicSchemas,
  organizationCredentialSchemas,
} from "@chatbotx.io/database/partials"
import { organizationCredentialModel } from "@chatbotx.io/database/schema"
import type { OrganizationCredentialModel } from "@chatbotx.io/database/types"
import { encryptUtils } from "@chatbotx.io/encryption"
import { withCache } from "@chatbotx.io/redis"
import type { z } from "zod"
import { BaseService } from "../base.service"

type CredentialRow<T extends OrganizationCredentialType> = Omit<
  OrganizationCredentialModel,
  "type" | "publicConfig"
> & {
  type: T
  publicConfig: OrganizationCredentialPublicByType[T]
}

type DecryptedCredential<T extends OrganizationCredentialType> = {
  id: string
  organizationId: string
  type: T
  publicConfig: OrganizationCredentialPublicByType[T]
  config: OrganizationCredentialByType[T]
  createdAt: Date
  updatedAt: Date
}

class OrganizationCredentialService extends BaseService {
  // Cached. Returns the row with `value` still encrypted — safe to call from
  // server components rendering the settings UI (only publicConfig should
  // ever cross the client boundary).
  async find<T extends OrganizationCredentialType>(props: {
    organizationId: string
    type: T
    tx?: DatabaseClient
  }): Promise<CredentialRow<T> | undefined> {
    const { organizationId, type, tx = db } = props
    const row = await withCache(
      `organization-credentials:${organizationId}:${type}`,
      () =>
        tx.query.organizationCredentialModel.findFirst({
          where: { organizationId, type },
        }),
      {
        dynamicTags: (cached) =>
          cached
            ? [
                `organizations:${organizationId}`,
                `organization-credentials:${organizationId}`,
                `organization-credentials:${organizationId}:${type}`,
              ]
            : undefined,
      },
    )
    return row as CredentialRow<T> | undefined
  }

  async findDecrypted<T extends OrganizationCredentialType>(props: {
    organizationId: string
    type: T
    tx?: DatabaseClient
  }): Promise<DecryptedCredential<T> | undefined> {
    const row = await this.find(props)
    if (!row) {
      return
    }
    const blob = organizationCredentialEncryptedSchema.parse(row.value)
    const schema = organizationCredentialSchemas[
      props.type
    ] as unknown as z.ZodType<OrganizationCredentialByType[T]>
    const aad = `${props.organizationId}:${props.type}`
    const config = await encryptUtils.decryptObject(blob, schema, aad)

    return {
      id: row.id,
      organizationId: row.organizationId,
      type: props.type,
      publicConfig: row.publicConfig as OrganizationCredentialPublicByType[T],
      config,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }

  async upsert<T extends OrganizationCredentialType>(props: {
    organizationId: string
    type: T
    config: OrganizationCredentialByType[T]
    tx?: DatabaseClient
  }): Promise<void> {
    const { organizationId, type, config, tx = db } = props
    const publicSchema = organizationCredentialPublicSchemas[
      type
    ] as unknown as z.ZodType<OrganizationCredentialPublicByType[T]>
    const publicConfig = publicSchema.parse(config)
    const aad = `${organizationId}:${type}`
    const value = await encryptUtils.encryptObject(config, aad)

    await tx
      .insert(organizationCredentialModel)
      .values({ organizationId, type, publicConfig, value })
      .onConflictDoUpdate({
        target: [
          organizationCredentialModel.organizationId,
          organizationCredentialModel.type,
        ],
        set: { publicConfig, value },
      })

    await this.invalidateCacheTags([
      `organization-credentials:${organizationId}:${type}`,
    ])
  }
}

export const organizationCredentialService = new OrganizationCredentialService()
