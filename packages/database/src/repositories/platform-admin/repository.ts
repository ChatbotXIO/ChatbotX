import { type DatabaseClient, db, desc, eq, sql } from "../../client"
import { ROOT_TENANT_ID } from "../../partials"
import {
  platformAdminBootstrapModel,
  platformAdminModel,
  userModel,
} from "../../schema"
import type { PlatformAdminModel } from "../../types"
import { getPaginationWithDefaults } from "../../utils"

export type ListPlatformAdminsInput = {
  page?: number | null
  perPage?: number | null
}

export type PlatformAdminWithUser = PlatformAdminModel & {
  userEmail: string
  userName: string | null
}

class PlatformAdminRepository {
  async existsByUserId(
    userId: string,
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const admin = await tx.query.platformAdminModel.findFirst({
      where: { userId },
      columns: { userId: true },
    })
    return Boolean(admin)
  }

  async findRootUserByEmail(
    email: string,
    tx: DatabaseClient = db,
  ): Promise<{ id: string } | undefined> {
    return await tx.query.userModel.findFirst({
      where: { email, tenantId: ROOT_TENANT_ID },
      columns: { id: true },
    })
  }

  async bootstrapRootAdmin(props: { email: string }): Promise<boolean> {
    return await db.transaction(async (tx) => {
      const user = await this.findRootUserByEmail(props.email, tx)
      if (!user) {
        return false
      }

      const [bootstrap] = await tx
        .insert(platformAdminBootstrapModel)
        .values({ email: props.email, userId: user.id })
        .onConflictDoNothing({
          target: platformAdminBootstrapModel.bootstrapKey,
        })
        .returning({ id: platformAdminBootstrapModel.id })
      if (!bootstrap) {
        return false
      }

      const admin = await this.insertIgnore({ userId: user.id, tx })
      if (!admin) {
        throw new Error("Platform bootstrap administrator was deleted")
      }

      return true
    })
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
