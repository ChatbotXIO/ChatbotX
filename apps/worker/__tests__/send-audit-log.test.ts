import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  dbInsert: vi.fn(),
  dbValues: vi.fn(),
  onConflictDoNothing: vi.fn(),
  NEXT_PUBLIC_EDITION: "enterprise",
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    insert: (...args: unknown[]) => mocks.dbInsert(...args),
  },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  auditLogModel: "auditLogModel",
}))

vi.mock("@chatbotx.io/utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/utils")>()),
  createId: () => "audit-log-1",
}))

vi.mock("../src/env", () => ({
  env: mocks,
}))

const { sendAuditLog } = await import("../src/default/handlers/send-audit-log")

beforeEach(() => {
  mocks.dbValues.mockReset()
  mocks.dbValues.mockReturnValue({
    onConflictDoNothing: mocks.onConflictDoNothing,
  })
  mocks.onConflictDoNothing.mockReset()
  mocks.onConflictDoNothing.mockResolvedValue(undefined)
  mocks.dbInsert.mockReset()
  mocks.dbInsert.mockReturnValue({ values: mocks.dbValues })
  mocks.NEXT_PUBLIC_EDITION = "enterprise"
})

describe("sendAuditLog", () => {
  test("inserts audit rows with where and source fields outside community edition", async () => {
    await sendAuditLog({
      auditLogId: "audit-log-from-job",
      userId: "user-1",
      workspaceId: "workspace-1",
      action: "export",
      detail: "Exported contacts",
      ipAddress: "203.0.113.10",
      userAgent: "Vitest",
      source: "export-contacts",
    })

    expect(mocks.dbInsert).toHaveBeenCalledWith("auditLogModel")
    expect(mocks.dbValues).toHaveBeenCalledWith({
      id: "audit-log-from-job",
      userId: "user-1",
      workspaceId: "workspace-1",
      action: "export",
      detail: "Exported contacts",
      ipAddress: "203.0.113.10",
      userAgent: "Vitest",
      source: "export-contacts",
    })
    expect(mocks.onConflictDoNothing).toHaveBeenCalled()
  })

  test("falls back to generated ids for legacy queued jobs", async () => {
    await sendAuditLog({
      userId: "user-1",
      workspaceId: "workspace-1",
      action: "update",
      detail: "Updated thing",
    })

    expect(mocks.dbValues).toHaveBeenCalledWith(
      expect.objectContaining({ id: "audit-log-1" }),
    )
    expect(mocks.onConflictDoNothing).toHaveBeenCalled()
  })

  test("does not insert audit rows in community edition", async () => {
    mocks.NEXT_PUBLIC_EDITION = "community"

    await sendAuditLog({
      userId: "user-1",
      workspaceId: "workspace-1",
      action: "update",
      detail: "Updated thing",
    })

    expect(mocks.dbInsert).not.toHaveBeenCalled()
  })
})
