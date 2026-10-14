import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  insertValues,
  insertReturning,
  findByIdAndWorkspace,
  listNamesWithPrefix,
  isUniqueViolationError,
} = vi.hoisted(() => ({
  insertValues: vi.fn(),
  insertReturning: vi.fn(),
  findByIdAndWorkspace: vi.fn(),
  listNamesWithPrefix: vi.fn(),
  isUniqueViolationError: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  and: vi.fn(),
  db: {
    insert: vi.fn(() => ({
      values: (values: unknown) => {
        insertValues(values)
        return { returning: insertReturning }
      },
    })),
  },
  eq: vi.fn(),
  inArray: vi.fn(),
  isUniqueViolationError,
  sql: vi.fn(),
}))
vi.mock("@chatbotx.io/database/schema", () => ({
  miniAppModel: {},
  miniAppPublicationModel: {},
  miniAppSubmissionModel: {},
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  miniAppRepository: { findByIdAndWorkspace, listNamesWithPrefix },
  miniAppSubmissionRepository: {},
}))
vi.mock("../src/contact/service", () => ({ contactService: {} }))
vi.mock("../src/contact-custom-field/service", () => ({
  contactCustomFieldService: {},
}))
vi.mock("../src/mini-app/upload-service", () => ({ miniAppUploadService: {} }))

const { createStarterDefinition, MINI_APP_NAME_MAX_LENGTH } = await import(
  "@chatbotx.io/mini-app"
)
const { miniAppService } = await import("../src/mini-app/service")

const source = (name: string) => ({
  id: "1",
  workspaceId: "ws-1",
  name,
  enabled: true,
  definition: createStarterDefinition("Welcome"),
})

const insertedNames = () =>
  insertValues.mock.calls.map(([values]) => (values as { name: string }).name)

const uniqueViolation = new Error("duplicate key")

beforeEach(() => {
  vi.clearAllMocks()
  isUniqueViolationError.mockImplementation(
    (error: unknown) => error === uniqueViolation,
  )
  insertReturning.mockImplementation(async () => [{ id: "2" }])
})

describe("miniAppService.duplicate", () => {
  test("picks the first free copy name and inserts once", async () => {
    findByIdAndWorkspace.mockResolvedValue(source("X"))
    listNamesWithPrefix.mockResolvedValue([
      "X",
      "X - Copy",
      "X - Copy 2",
      "X - Copy 3",
    ])

    await miniAppService.duplicate({ workspaceId: "ws-1", id: "1" })

    expect(listNamesWithPrefix).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      prefix: "X",
    })
    expect(insertedNames()).toEqual(["X - Copy 4"])
  })

  test("tries the next free name once when a parallel copy took it", async () => {
    findByIdAndWorkspace.mockResolvedValue(source("X"))
    listNamesWithPrefix.mockResolvedValue([])
    insertReturning.mockRejectedValueOnce(uniqueViolation)

    await miniAppService.duplicate({ workspaceId: "ws-1", id: "1" })

    expect(insertedNames()).toEqual(["X - Copy", "X - Copy 2"])
  })

  test("gives up with name taken after the retry", async () => {
    findByIdAndWorkspace.mockResolvedValue(source("X"))
    listNamesWithPrefix.mockResolvedValue([])
    insertReturning.mockRejectedValue(uniqueViolation)

    await expect(
      miniAppService.duplicate({ workspaceId: "ws-1", id: "1" }),
    ).rejects.toThrow()
    expect(insertValues).toHaveBeenCalledTimes(2)
  })

  test("cuts a long name so copy names fit the limit", async () => {
    const longName = "a".repeat(MINI_APP_NAME_MAX_LENGTH)
    findByIdAndWorkspace.mockResolvedValue(source(longName))
    listNamesWithPrefix.mockResolvedValue([])

    await miniAppService.duplicate({ workspaceId: "ws-1", id: "1" })

    const [name] = insertedNames()
    expect(name).toHaveLength(MINI_APP_NAME_MAX_LENGTH)
    expect(name?.endsWith(" - Copy")).toBe(true)
    expect(
      name?.startsWith(listNamesWithPrefix.mock.calls[0]?.[0].prefix),
    ).toBe(true)
  })
})
