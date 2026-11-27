// @vitest-environment node

import { describe, expect, test } from "vitest"
import { userResource } from "@/features/users/schema/resource"

describe("userResource", () => {
  test("has no connectionAuthorizations property", () => {
    expect(Object.keys(userResource.shape)).not.toContain(
      "connectionAuthorizations",
    )
  })

  test("strips the encrypted backup from a parsed user", () => {
    const parsed = userResource.parse({
      id: "1",
      name: "Agent",
      email: "agent@example.com",
      emailVerified: true,
      image: null,
      isAnonymous: false,
      mustChangePassword: false,
      deletionRequestedAt: null,
      scheduledDeletionAt: null,
      tenantId: "1",
      createdAt: new Date(),
      updatedAt: new Date(),
      connectionAuthorizations: { messenger: { encryptedAuth: "ciphertext" } },
    })

    expect(parsed).not.toHaveProperty("connectionAuthorizations")
  })
})
