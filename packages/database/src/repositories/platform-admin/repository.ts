import { invalidateCacheKeys, withCache } from "@chatbotx.io/redis"
import { and, type DatabaseClient, db, desc, eq, ne, sql } from "../../client"
import { type PlatformAdminRole, ROOT_TENANT_ID } from "../../partials"
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

export const platformAdminCacheKey = (userId: string): string =>
  `platform-admin:${userId}`

class PlatformAdminRepository {
  async findByUserId(userId: string): Promise<PlatformAdminModel | undefined> {
    const cacheKey = platformAdminCacheKey(userId)
    return await withCache(
      cacheKey,
      () => db.query.platformAdminModel.findFirst({ where: { userId } }),
      { ttl: PLATFORM_ADMIN_CACHE_TTL_SECONDS },
    )
  }

  async invalidateByUserId(userId: string): Promise<void> {
    await invalidateCacheKeys(platformAdminCacheKey(userId))
  }

  async findForAuth(userId: string): Promise<PlatformAdminModel | undefined> {
    return await db.query.platformAdminModel.findFirst({ where: { userId } })
  }

  async bootstrapRootAdmin(props: { email: string }): Promise<boolean> {
    const user = await userRepository.findIdByEmail({
      email: props.email,
      tenantId: ROOT_TENANT_ID,
    })
    if (!user) {
      return false
    }

    const [created] = await db
      .insert(platformAdminModel)
      .values({ role: "super-admin", userId: user.id })
      .onConflictDoNothing({ target: platformAdminModel.userId })
      .returning({ id: platformAdminModel.id })
    const [promoted] = created
      ? []
      : await db
          .update(platformAdminModel)
          .set({ role: "super-admin" })
          .where(
            and(
              eq(platformAdminModel.userId, user.id),
              ne(platformAdminModel.role, "super-admin"),
            ),
          )
          .returning({ id: platformAdminModel.id })

    if (!(created ?? promoted)) {
      return false
    }

    await this.invalidateByUserId(user.id)
    return true
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

  async upsertRole(props: {
    role: PlatformAdminRole
    userId: string
    tx?: DatabaseClient
  }): Promise<PlatformAdminModel | undefined> {
    const { role, userId, tx = db } = props
    const [admin] = await tx
      .insert(platformAdminModel)
      .values({ role, userId })
      .onConflictDoUpdate({
        target: platformAdminModel.userId,
        set: { role },
      })
      .returning()
    return admin
  }

  async deleteByUserId(userId: string, tx: DatabaseClient = db): Promise<void> {
    await tx
      .delete(platformAdminModel)
      .where(eq(platformAdminModel.userId, userId))
  }
}

export const platformAdminRepository = new PlatformAdminRepository()
