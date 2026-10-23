import { invalidateCacheByTags, withCache } from "@chatbotx.io/redis"
import { type DatabaseClient, db, desc, eq, sql } from "../../client"
import { ROOT_TENANT_ID } from "../../partials"
import { platformAdminModel, userModel } from "../../schema"
import type { PlatformAdminModel } from "../../types"
import { getPaginationWithDefaults } from "../../utils"
import { userRepository } from "../user"

export type ListPlatformAdminsInput = {
  page?: number | null
  perPage?: number | null
}

export type PlatformAdminWithUser = PlatformAdminModel & {
  userEmail: string
  userName: string | null
}

// Authorization cache entries are short-lived so a failed invalidation can
// never preserve a revoked administrator role for long.
const PLATFORM_ADMIN_CACHE_TTL_SECONDS = 60

export const platformAdminCacheTag = (userId: string): string =>
  `platform-admin:${userId}`

class PlatformAdminRepository {
  async findByUserId(
    userId: string,
  ): Promise<PlatformAdminModel | undefined> {
    const cacheTag = platformAdminCacheTag(userId)
    return await withCache(
      cacheTag,
      () => db.query.platformAdminModel.findFirst({ where: { userId } }),
      {
        ttl: PLATFORM_ADMIN_CACHE_TTL_SECONDS,
        tags: [cacheTag],
      },
    )
  }

  async invalidateByUserId(userId: string): Promise<void> {
    await invalidateCacheByTags([platformAdminCacheTag(userId)])
  }

  async existsByUserId(
    userId: string,
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    if (tx === db) {
      return Boolean(await this.findByUserId(userId))
    }

    const admin = await tx.query.platformAdminModel.findFirst({
      where: { userId },
      columns: { userId: true },
    })
    return Boolean(admin)
  }

  async bootstrapRootAdmin(props: { email: string }): Promise<boolean> {
    const user = await userRepository.findIdByEmail({
      email: props.email,
      tenantId: ROOT_TENANT_ID,
    })
    if (!user) {
      return false
    }

    const [admin] = await db
      .insert(platformAdminModel)
      .values({ userId: user.id })
      .onConflictDoNothing({ target: platformAdminModel.userId })
      .returning({ id: platformAdminModel.id })

    if (admin) {
      await this.invalidateByUserId(user.id)
    }
    return Boolean(admin)
  }

  async listWithUser(input: ListPlatformAdminsInput): Promise<{
    data: PlatformAdminWithUser[]
    pageCount: number
  }> {
    const pagination = getPaginationWithDefaults(input)
    const [data, [{ count }]] = await Promise.all([
      db
        .select({
          id: platformAdminModel.id,
          createdAt: platformAdminModel.createdAt,
          updatedAt: platformAdminModel.updatedAt,
          userId: platformAdminModel.userId,
          role: platformAdminModel.role,
          userEmail: userModel.email,
          userName: userModel.name,
        })
        .from(platformAdminModel)
        .innerJoin(userModel, eq(platformAdminModel.userId, userModel.id))
        .orderBy(desc(platformAdminModel.createdAt))
        .limit(pagination.limit)
        .offset(pagination.offset),
      db.select({ count: sql<number>`count(*)::int` }).from(platformAdminModel),
    ])

    return {
      data,
      pageCount: Math.ceil(count / pagination.limit),
    }
  }

  async insertIgnore(props: {
    userId: string
    tx?: DatabaseClient
  }): Promise<PlatformAdminModel | undefined> {
    const { userId, tx = db } = props
    const [created] = await tx
      .insert(platformAdminModel)
      .values({ userId })
      .onConflictDoNothing({ target: platformAdminModel.userId })
      .returning()
    if (created) {
      return created
    }

    return await tx.query.platformAdminModel.findFirst({ where: { userId } })
  }

  async deleteByUserId(userId: string, tx: DatabaseClient = db): Promise<void> {
    await tx
      .delete(platformAdminModel)
      .where(eq(platformAdminModel.userId, userId))
  }
}

export const platformAdminRepository = new PlatformAdminRepository()
