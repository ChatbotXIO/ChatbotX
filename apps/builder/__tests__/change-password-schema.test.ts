import { describe, expect, test } from "vitest"
import { changePasswordRequest } from "@/features/auth/schemas/action"

describe("changePasswordRequest", () => {
  const base = {
    currentPassword: "old-password-1",
    newPassword: "new-password-2",
    passwordConfirmation: "new-password-2",
  }

  test("accepts a valid, distinct, matching new password", () => {
    expect(changePasswordRequest.safeParse(base).success).toBe(true)
  })

  test("rejects when confirmation does not match", () => {
    const result = changePasswordRequest.safeParse({
      ...base,
      passwordConfirmation: "different-3",
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual(["passwordConfirmation"])
  })

  test("rejects when the new password equals the current password", () => {
    const result = changePasswordRequest.safeParse({
      currentPassword: "same-password-1",
      newPassword: "same-password-1",
      passwordConfirmation: "same-password-1",
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues.some((i) => i.path[0] === "newPassword")).toBe(
      true,
    )
  })

  test("rejects passwords shorter than 8 characters", () => {
    const result = changePasswordRequest.safeParse({
      currentPassword: "short",
      newPassword: "alsoshort",
      passwordConfirmation: "alsoshort",
    })
    expect(result.success).toBe(false)
  })
})
