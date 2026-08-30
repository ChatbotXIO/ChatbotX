import { db, eq } from "@chatbotx.io/database/client"
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
}

export const userService = new UserService()
