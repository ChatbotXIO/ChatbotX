import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockAnd,
  mockDbDelete,
  mockDbFindMany,
  mockDbInsert,
  mockDbOnConflictDoUpdate,
  mockDbReturning,
  mockDbValues,
  mockDbWhere,
  mockEq,
  mockInArray,
} = vi.hoisted(() => {
  const insertChain = {
    values: vi.fn(),
    onConflictDoUpdate: vi.fn(),
    returning: vi.fn(),
  }
  insertChain.values.mockReturnValue(insertChain)
  insertChain.onConflictDoUpdate.mockReturnValue(insertChain)
  insertChain.returning.mockResolvedValue([])
  const mockDbInsert = vi.fn(() => insertChain)

  const deleteChain = { where: vi.fn() }
  deleteChain.where.mockResolvedValue(undefined)
  const mockDbDelete = vi.fn(() => deleteChain)

  return {
    mockAnd: vi.fn((...conditions: unknown[]) => ({ and: conditions })),
    mockDbDelete,
    mockDbFindMany: vi.fn(),
    mockDbInsert,
    mockDbOnConflictDoUpdate: insertChain.onConflictDoUpdate,
    mockDbReturning: insertChain.returning,
    mockDbValues: insertChain.values,
    mockDbWhere: deleteChain.where,
    mockEq: vi.fn((field: unknown, value: unknown) => ({ field, value })),
    mockInArray: vi.fn((field: unknown, values: unknown[]) => ({
      field,
      values,
    })),
  }
})

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    insert: mockDbInsert,
    delete: mockDbDelete,
    query: { userDeviceTokenModel: { findMany: mockDbFindMany } },
  },
  and: mockAnd,
  eq: mockEq,
  inArray: mockInArray,
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  userDeviceTokenModel: {
    token: "userDeviceToken.token",
    userId: "userDeviceToken.userId",
  },
}))

const { deviceTokenService } = await import("../src/device-token/service")

describe("deviceTokenService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDbReturning.mockResolvedValue([])
    mockDbWhere.mockResolvedValue(undefined)
    mockDbFindMany.mockResolvedValue([])
  })

  describe("upsert", () => {
    test("inserts and conflicts on token, updating the row's identity and lastSeenAt", async () => {
      const row = { id: "dt-1", userId: "user-1", token: "expo-token-1" }
      mockDbReturning.mockResolvedValue([row])

      const result = await deviceTokenService.upsert({
        userId: "user-1",
        workspaceId: "ws-1",
        platform: "ios",
        token: "expo-token-1",
      })

      expect(mockDbInsert).toHaveBeenCalledOnce()
      expect(mockDbValues).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-1",
          workspaceId: "ws-1",
          platform: "ios",
          token: "expo-token-1",
          lastSeenAt: expect.any(Date),
        }),
      )
      expect(mockDbOnConflictDoUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          target: ["userDeviceToken.token"],
          set: expect.objectContaining({
            userId: "user-1",
            workspaceId: "ws-1",
            platform: "ios",
            lastSeenAt: expect.any(Date),
          }),
        }),
      )
      expect(result).toEqual(row)
    })
  })

  describe("deleteByToken", () => {
    test("scopes the delete by both token and userId — one user cannot delete another's token", async () => {
      await deviceTokenService.deleteByToken({
        userId: "user-1",
        token: "expo-token-1",
      })

      expect(mockDbDelete).toHaveBeenCalledOnce()
      expect(mockEq).toHaveBeenCalledWith(
        "userDeviceToken.token",
        "expo-token-1",
      )
      expect(mockEq).toHaveBeenCalledWith("userDeviceToken.userId", "user-1")
      expect(mockAnd).toHaveBeenCalledWith(
        { field: "userDeviceToken.token", value: "expo-token-1" },
        { field: "userDeviceToken.userId", value: "user-1" },
      )
    })
  })

  describe("deleteByTokens", () => {
    test("short-circuits on an empty token array without touching the database", async () => {
      await deviceTokenService.deleteByTokens({ tokens: [] })

      expect(mockDbDelete).not.toHaveBeenCalled()
    })

    test("deletes all matching tokens via inArray", async () => {
      await deviceTokenService.deleteByTokens({
        tokens: ["expo-token-1", "expo-token-2"],
      })

      expect(mockDbDelete).toHaveBeenCalledOnce()
      expect(mockInArray).toHaveBeenCalledWith("userDeviceToken.token", [
        "expo-token-1",
        "expo-token-2",
      ])
    })
  })

  describe("findByUserIds", () => {
    test("short-circuits on an empty userIds array without querying", async () => {
      const result = await deviceTokenService.findByUserIds({ userIds: [] })

      expect(result).toEqual([])
      expect(mockDbFindMany).not.toHaveBeenCalled()
    })

    test("queries device tokens scoped to the given userIds", async () => {
      const rows = [{ id: "dt-1", userId: "user-1", token: "expo-token-1" }]
      mockDbFindMany.mockResolvedValue(rows)

      const result = await deviceTokenService.findByUserIds({
        userIds: ["user-1", "user-2"],
      })

      expect(mockDbFindMany).toHaveBeenCalledWith({
        where: { userId: { in: ["user-1", "user-2"] } },
      })
      expect(result).toEqual(rows)
    })
  })
})
