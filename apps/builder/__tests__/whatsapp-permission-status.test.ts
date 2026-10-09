import { describe, expect, test } from "vitest"
import { getPermissionStatus } from "@/features/integration-whatsapp/libs/permission-status"

const credential = {
  clientId: "client-1",
  version: "v23.0",
  configId: "config-1",
  systemUserId: "su-1",
  businessId: "biz-1",
  businessName: "Biz",
  verifyToken: "verify",
}

describe("getPermissionStatus", () => {
  test("is ready when the scope is stored", () => {
    expect(getPermissionStatus({ hasCapiScope: true }, credential)).toBe(
      "ready",
    )
  })

  test("is ready without the scope when a credential exists (WhatsApp is exempt)", () => {
    expect(getPermissionStatus({ hasCapiScope: false }, credential)).toBe(
      "ready",
    )
  })

  test("is unverified without the scope and without a credential", () => {
    expect(getPermissionStatus({ hasCapiScope: false }, null)).toBe(
      "unverified",
    )
  })
})
