"use server"

import { userService } from "@chatbotx.io/business"
import { getCurrentUserId } from "@/lib/auth/utils"

export type AccountDeletionState =
  | { status: "idle" }
  | { status: "error" }
  | { status: "success" }

export const requestAccountDeletion = async (
  _previousState: AccountDeletionState,
  formData: FormData,
): Promise<AccountDeletionState> => {
  if (formData.get("confirmation") !== "DELETE") {
    return { status: "error" }
  }

  const userId = await getCurrentUserId()
  if (!userId) {
    return { status: "error" }
  }

  await userService.requestAccountDeletion({
    actor: { userId },
    userId,
  })
  return { status: "success" }
}
