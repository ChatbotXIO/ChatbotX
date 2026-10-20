import {
  type DatabaseClient,
  db,
  desc,
  eq,
  isUniqueViolationError,
  sql,
} from "../../client"
import { ROOT_TENANT_ID } from "../../partials"
import { accountModel, platformAdminModel, userModel } from "../../schema"
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

  /**
   * Create a root-tenant user with a credential account in one transaction.
   * `emailVerified` is true because a super admin vouched for the address (and
   * `requireEmailVerification` would otherwise block the first sign-in);
   * `mustChangePassword` forces the generated password to be replaced.
   * A concurrent create of the same email loses on `User_email_tenant_key`;
   * translate that into `created: false` instead of surfacing a raw 23505.
   */
  async insertRootUserWithCredential(props: {
    email: string
    hashedPassword: string
  }): Promise<{ userId: string; created: boolean }> {
    try {
      const userId = await db.transaction(async (tx) => {
        const [createdUser] = await tx
          .insert(userModel)
          .values({
            email: props.email,
            emailVerified: true,
            mustChangePassword: true,
            tenantId: ROOT_TENANT_ID,
          })
          .returning({ id: userModel.id })

        if (!createdUser) {
          throw new Error("Failed to create root platform user")
        }

        await tx.insert(accountModel).values({
          accountId: createdUser.id,
          providerId: "credential",
          password: props.hashedPassword,
          userId: createdUser.id,
          tenantId: ROOT_TENANT_ID,
        })

        return createdUser.id
      })

      return { userId, created: true }
    } catch (error) {
      if (isUniqueViolationError(error)) {
        const raced = await this.findRootUserByEmail(props.email)
        if (raced) {
          return { userId: raced.id, created: false }
        }
      }
      throw error
    }
  }

  async bootstrapRootAdmin(props: { email: string }): Promise<boolean> {
    const user = await this.findRootUserByEmail(props.email)
    if (!user) {
      return false
    }

    const [admin] = await db
      .insert(platformAdminModel)
      .values({ userId: user.id })
      .onConflictDoNothing({ target: platformAdminModel.userId })
      .returning({ id: platformAdminModel.id })

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
