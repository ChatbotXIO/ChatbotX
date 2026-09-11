import { db, eq, inArray } from "@chatbotx.io/database/client"
import { userModel } from "@chatbotx.io/database/schema"
import type { UserModel } from "@chatbotx.io/database/types"
import { BaseService } from "../base.service"
import { notFoundException } from "../errors"

class UserService extends BaseService {
  /**
   * Clear the forced-password-change gate for a user. Called server-side ONLY
   * after better-auth has verified the current password and applied the change —
   * never expose a standalone "clear the flag" path to clients, or a provisioned
   * account could keep its temporary password.
   */
  async clearMustChangePassword(userId: string): Promise<void> {
    await db
      .update(userModel)
      .set({ mustChangePassword: false })
      .where(eq(userModel.id, userId))
  }

  async findByIdOrFail(userId: string): Promise<UserModel> {
    const user = await db.query.userModel.findFirst({ where: { id: userId } })
    if (!user) {
      throw notFoundException("User not found")
    }
    return user
  }

  async findNameAndEmail(
    userId: string,
  ): Promise<{ name: string | null; email: string | null } | undefined> {
    return await db.query.userModel.findFirst({
      where: { id: userId },
      columns: { name: true, email: true },
    })
  }

  /**
   * Of the given ids, the ones that still have a `User` row. Used to drop ids
   * that outlived their user — a deleted `User` cascades its `UserQuota` row but
   * not the Redis live-counter key, so reconciling such a ghost id would violate
   * the `UserQuota → User` foreign key on every run.
   */
  async listExistingIds(input: { ids: string[] }): Promise<string[]> {
    if (input.ids.length === 0) {
      return []
    }

    const rows = await db
      .select({ id: userModel.id })
      .from(userModel)
      .where(inArray(userModel.id, input.ids))

    return rows.map((row) => row.id)
  }
}

export const userService = new UserService()
