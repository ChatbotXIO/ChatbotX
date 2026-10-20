import { type DatabaseClient, db, isUniqueViolationError } from "../../client"
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
}

export const userRepository = new UserRepository()
