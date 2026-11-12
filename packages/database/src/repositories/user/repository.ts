import {
  and,
  type DatabaseClient,
  db,
  eq,
  isNotNull,
  isUniqueViolationError,
  lte,
} from "../../client"
import { accountModel, userModel } from "../../schema"

class UserRepository {
  async findIdByEmail(
    props: { email: string; tenantId: string },
    tx: DatabaseClient = db,
  ): Promise<{ id: string } | undefined> {
    return await tx.query.userModel.findFirst({
      where: { email: props.email, tenantId: props.tenantId },
      columns: { id: true },
    })
  }

  async insertWithCredential(props: {
    email: string
    name?: string
    hashedPassword: string
    tenantId: string
  }): Promise<{ userId: string; created: boolean }> {
    try {
      const userId = await db.transaction(async (tx) => {
        const [createdUser] = await tx
          .insert(userModel)
          .values({
            email: props.email,
            name: props.name,
            emailVerified: true,
            mustChangePassword: true,
            tenantId: props.tenantId,
          })
          .returning({ id: userModel.id })

        if (!createdUser) {
          throw new Error("Failed to create user with credential")
        }

        await tx.insert(accountModel).values({
          accountId: createdUser.id,
          providerId: "credential",
          password: props.hashedPassword,
          userId: createdUser.id,
          tenantId: props.tenantId,
        })

        return createdUser.id
      })

      return { userId, created: true }
    } catch (error) {
      if (isUniqueViolationError(error)) {
        const raced = await this.findIdByEmail({
          email: props.email,
          tenantId: props.tenantId,
        })
        if (raced) {
          return { userId: raced.id, created: false }
        }
      }
      throw error
    }
  }

  async findForAccountDeletion(userId: string, tx: DatabaseClient) {
    const [user] = await tx
      .select({
        deletionRequestedAt: userModel.deletionRequestedAt,
        id: userModel.id,
        scheduledDeletionAt: userModel.scheduledDeletionAt,
      })
      .from(userModel)
      .where(eq(userModel.id, userId))
      .limit(1)
      .for("update")
    return user
  }

  async listDueForPurge(input: {
    now: Date
    limit: number
  }): Promise<string[]> {
    const rows = await db
      .select({ id: userModel.id })
      .from(userModel)
      .where(
        and(
          isNotNull(userModel.deletionRequestedAt),
          isNotNull(userModel.scheduledDeletionAt),
          lte(userModel.scheduledDeletionAt, input.now),
        ),
      )
      .orderBy(userModel.scheduledDeletionAt, userModel.id)
      .limit(input.limit)
    return rows.map((row) => row.id)
  }

  async markDeletionRequested(
    input: {
      userId: string
      requestedAt: Date
      scheduledDeletionAt: Date
    },
    tx: DatabaseClient,
  ): Promise<void> {
    await tx
      .update(userModel)
      .set({
        deletionRequestedAt: input.requestedAt,
        scheduledDeletionAt: input.scheduledDeletionAt,
      })
      .where(eq(userModel.id, input.userId))
  }

  async deleteIfDue(input: {
    userId: string
    now: Date
    tx: DatabaseClient
  }): Promise<boolean> {
    const rows = await input.tx
      .delete(userModel)
      .where(
        and(
          eq(userModel.id, input.userId),
          isNotNull(userModel.deletionRequestedAt),
          lte(userModel.scheduledDeletionAt, input.now),
        ),
      )
      .returning({ id: userModel.id })
    return rows.length > 0
  }

  async postponePurge(
    input: { userId: string; until: Date },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(userModel)
      .set({ scheduledDeletionAt: input.until })
      .where(
        and(
          eq(userModel.id, input.userId),
          isNotNull(userModel.deletionRequestedAt),
        ),
      )
  }
}

export const userRepository = new UserRepository()
