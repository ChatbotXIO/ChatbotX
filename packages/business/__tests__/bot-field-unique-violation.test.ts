// @vitest-environment node

import { afterEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  insertValues: vi.fn(),
  insertReturning: vi.fn(),
  updateSet: vi.fn(),
  updateWhere: vi.fn(),
  updateReturning: vi.fn(),
  invalidateCacheTags: vi.fn(),
  withCacheInvalidate: vi.fn(),
}))

const botFieldModel = {
  id: "BOT_FIELD_ID_COL",
  workspaceId: "BOT_FIELD_WORKSPACE_ID_COL",
  name: "BOT_FIELD_NAME_COL",
}

class UniqueViolationError extends Error {
  cause = { code: "23505" }
}

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      botFieldModel: { findFirst: mocks.findFirst },
    },
    insert: vi.fn(() => ({
      values: (value: unknown) => {
        mocks.insertValues(value)
        return { returning: mocks.insertReturning }
      },
    })),
    update: vi.fn(() => ({
      set: (setValue: unknown) => {
        mocks.updateSet(setValue)
        return {
          where: (whereValue: unknown) => {
            mocks.updateWhere(whereValue)
            return { returning: mocks.updateReturning }
          },
        }
      },
    })),
  },
  and: vi.fn((...conditions: unknown[]) => ({ and: conditions })),
  eq: vi.fn((column: unknown, value: unknown) => ({ eq: [column, value] })),
  inArray: vi.fn(),
  isUniqueViolationError: (error: unknown) =>
    error instanceof UniqueViolationError,
  relationsFilterToSQL: vi.fn(),
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  rootFolderId: "root",
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  botFieldModel,
}))

vi.mock("@chatbotx.io/database/utils", () => ({
  likeContains: (value: string) => value,
  parseOrderByAsObject: vi.fn(),
  parsePagination: vi.fn(),
}))

vi.mock("@chatbotx.io/redis", () => ({
  withCache: (_key: string, fn: () => unknown) => fn(),
}))

vi.mock("../src/base.service", () => ({
  BaseService: class BaseService {
    invalidateCacheTags(...args: unknown[]) {
      return mocks.invalidateCacheTags(...args)
    }
    invalidate(...args: unknown[]) {
      return mocks.withCacheInvalidate(...args)
    }
  },
}))

vi.mock("../src/errors", () => ({
  notFoundException: (message: string) => new Error(message),
  validationException: (field: string, message: string) => {
    const error = new Error(message) as Error & {
      code: string
      field: string
    }
    error.code = "validation"
    error.field = field
    return error
  },
  ChatbotXException: class ChatbotXException extends Error {},
}))

vi.mock("../src/folder/service", () => ({
  folderService: { ensureExists: vi.fn() },
}))

const { botFieldService } = await import("../src/bot-field/service")

describe("botFieldService — unique-violation mapping", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("create maps a 23505 unique violation to validationException(name)", async () => {
    mocks.insertReturning.mockRejectedValue(new UniqueViolationError())

    await expect(
      botFieldService.create({
        workspaceId: "ws-1",
        data: { name: "Existing Field", type: "shortText" },
      }),
    ).rejects.toMatchObject({
      code: "validation",
      field: "name",
      message: "Name is already taken",
    })
  })

  test("create rethrows a non-unique-violation database error unchanged", async () => {
    const otherError = new Error("connection reset")
    mocks.insertReturning.mockRejectedValue(otherError)

    await expect(
      botFieldService.create({
        workspaceId: "ws-1",
        data: { name: "New Field", type: "shortText" },
      }),
    ).rejects.toBe(otherError)
  })

  test("updateByKey (via persistUpdate) maps a 23505 unique violation to validationException(name)", async () => {
    mocks.findFirst.mockResolvedValue({
      id: "field-1",
      workspaceId: "ws-1",
      name: "field",
      type: "shortText",
      value: null,
      folderId: null,
    })
    mocks.updateReturning.mockRejectedValue(new UniqueViolationError())

    await expect(
      botFieldService.updateByKey({
        workspaceId: "ws-1",
        key: "field-1",
        data: { name: "Taken Name" },
      }),
    ).rejects.toMatchObject({
      code: "validation",
      field: "name",
      message: "Name is already taken",
    })
  })
})
