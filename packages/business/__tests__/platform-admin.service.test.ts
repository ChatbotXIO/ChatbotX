import { beforeEach, describe, expect, test, vi } from "vitest"
import type { ChatbotXException } from "../src/errors"
import { platformAdminService } from "../src/platform-admin/service"

const mocks = vi.hoisted(() => ({
  deleteByUserId: vi.fn(),
  findRootUserByEmail: vi.fn(),
  insertIgnore: vi.fn(),
  loggerInfo: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  platformAdminRepository: {
    deleteByUserId: mocks.deleteByUserId,
    findRootUserByEmail: mocks.findRootUserByEmail,
    insertIgnore: mocks.insertIgnore,
  },
}))
vi.mock("../src/logger", () => ({
  logger: { info: mocks.loggerInfo },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe("platformAdminService.add", () => {
  test("adds a root-tenant user idempotently", async () => {
    const admin = { id: "admin-1", userId: "user-1", role: "super-admin" }
    mocks.findRootUserByEmail.mockResolvedValue({ id: "user-1" })
    mocks.insertIgnore.mockResolvedValue(admin)

    await expect(
      platformAdminService.add({
        actorId: "actor-1",
        email: "admin@example.com",
      }),
    ).resolves.toBe(admin)
    expect(mocks.findRootUserByEmail).toHaveBeenCalledWith("admin@example.com")
    expect(mocks.insertIgnore).toHaveBeenCalledWith({ userId: "user-1" })
  })

  test("returns a 404 when the email is absent from the root tenant", async () => {
    mocks.findRootUserByEmail.mockResolvedValue(undefined)

    await expect(
      platformAdminService.add({
        actorId: "actor-1",
        email: "missing@example.com",
      }),
    ).rejects.toMatchObject<Partial<ChatbotXException>>({
      code: "userNotFound",
      httpStatusCode: 404,
    })
    expect(mocks.insertIgnore).not.toHaveBeenCalled()
  })
})

describe("platformAdminService.remove", () => {
  test("refuses self-removal", async () => {
    await expect(
      platformAdminService.remove({ actorId: "user-1", userId: "user-1" }),
    ).rejects.toMatchObject<Partial<ChatbotXException>>({
      code: "cannotRemoveSelf",
      httpStatusCode: 400,
    })
    expect(mocks.deleteByUserId).not.toHaveBeenCalled()
  })
})
