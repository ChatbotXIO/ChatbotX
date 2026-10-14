import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  updateReturning,
  setValues,
  emitCustomFieldChanges,
  findById,
  warn,
  claimForSubmission,
} = vi.hoisted(() => ({
  updateReturning: vi.fn(),
  setValues: vi.fn(),
  emitCustomFieldChanges: vi.fn(),
  findById: vi.fn(),
  warn: vi.fn(),
  claimForSubmission: vi.fn(),
}))

/** `setValuesInTransaction` called as `setValues(input)`, the savepoint dropped. */
const tx = {
  transaction: vi.fn(
    async (run: (client: unknown) => unknown) => await run("savepoint"),
  ),
  insert: vi.fn(() => ({ values: vi.fn() })),
  update: vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn(() => ({ returning: updateReturning })),
    })),
  })),
}

vi.mock("@chatbotx.io/database/client", () => ({
  and: vi.fn(),
  db: {
    transaction: vi.fn(
      async (run: (client: typeof tx) => unknown) => await run(tx),
    ),
  },
  eq: vi.fn(),
  inArray: vi.fn(),
  isUniqueViolationError: vi.fn(),
  sql: vi.fn(),
}))
vi.mock("@chatbotx.io/database/schema", () => ({
  miniAppModel: { id: "id", submissionsCount: "submissionsCount" },
  miniAppPublicationModel: {},
  miniAppSubmissionModel: { id: "id" },
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  miniAppRepository: {},
  miniAppSubmissionRepository: {},
}))
vi.mock("../src/contact/service", () => ({ contactService: { findById } }))
vi.mock("../src/contact-custom-field/service", () => ({
  contactCustomFieldService: {
    setValuesInTransaction: (input: unknown) => setValues(input),
    emitCustomFieldChanges,
  },
}))
vi.mock("../src/logger", () => ({ logger: { warn } }))
vi.mock("../src/mini-app/upload-service", () => ({
  miniAppUploadService: { claimForSubmission },
}))

const { applyCustomFieldMappings } = await import("@chatbotx.io/mini-app")
const { miniAppSubmissionService } = await import("../src/mini-app/service")

const definition = applyCustomFieldMappings(
  {
    screens: [
      {
        key: "s1",
        id: "WELCOME",
        title: "",
        children: [
          {
            id: "n1",
            type: "TextInput",
            props: { name: "full_name", label: "Name" },
          },
          {
            id: "n2",
            type: "CheckboxGroup",
            props: { name: "topics", label: "Topics", "data-source": [] },
          },
          {
            id: "n3",
            type: "TextInput",
            props: { name: "note", label: "Note" },
          },
          {
            id: "n4",
            type: "PhotoPicker",
            props: { name: "photo", label: "Photo" },
          },
        ],
      },
    ],
  },
  { full_name: "cf-name", topics: "cf-topics", photo: "cf-photo" },
)
const miniApp = { id: "10", workspaceId: "ws-1", definition }

beforeEach(() => {
  vi.clearAllMocks()
  updateReturning.mockResolvedValue([{ id: "sub-1" }])
  findById.mockResolvedValue({ id: "c-1" })
  setValues.mockImplementation(
    async (input: { fields: { customFieldId: string }[] }) =>
      input.fields.map((field) => ({ customFieldId: field.customFieldId })),
  )
})

describe("miniAppSubmissionService.create — custom fields", () => {
  test("writes mapped answers to the contact's custom fields", async () => {
    await miniAppSubmissionService.create({
      miniApp,
      contactId: "c-1",
      answers: { full_name: "Ana", topics: ["a", "b"], note: "unmapped" },
      sourceTimezone: "Asia/Ho_Chi_Minh",
    })
    // Every mapped field in one write, events and cache cleared once.
    expect(setValues).toHaveBeenCalledTimes(1)
    expect(setValues).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "c-1",
      fields: [
        { customFieldId: "cf-name", value: "Ana" },
        { customFieldId: "cf-topics", value: "a, b" },
      ],
      sourceTimezone: "Asia/Ho_Chi_Minh",
    })
    expect(emitCustomFieldChanges).toHaveBeenCalledTimes(1)
    expect(emitCustomFieldChanges).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "c-1",
      changes: [{ customFieldId: "cf-name" }, { customFieldId: "cf-topics" }],
    })
  })

  test("one rejected value does not drop the other fields", async () => {
    setValues.mockImplementation(
      (input: { fields: { customFieldId: string }[] }) =>
        input.fields.some((field) => field.customFieldId === "cf-name")
          ? Promise.reject(new Error("invalid number"))
          : Promise.resolve(
              input.fields.map((field) => ({
                customFieldId: field.customFieldId,
              })),
            ),
    )
    await miniAppSubmissionService.create({
      miniApp,
      contactId: "c-1",
      answers: { full_name: "Ana", topics: ["a"] },
    })
    // The batch fails, then each field is retried behind its own savepoint.
    expect(setValues).toHaveBeenCalledTimes(3)
    expect(setValues).toHaveBeenLastCalledWith(
      expect.objectContaining({
        fields: [{ customFieldId: "cf-topics", value: "a" }],
      }),
    )
    expect(warn).toHaveBeenCalledTimes(1)
    expect(emitCustomFieldChanges).toHaveBeenCalledTimes(1)
    expect(emitCustomFieldChanges).toHaveBeenCalledWith(
      expect.objectContaining({ changes: [{ customFieldId: "cf-topics" }] }),
    )
  })

  test("does not write anything for an anonymous submission", async () => {
    await miniAppSubmissionService.create({
      miniApp,
      contactId: null,
      answers: { full_name: "Ana" },
    })
    expect(setValues).not.toHaveBeenCalled()
    expect(emitCustomFieldChanges).not.toHaveBeenCalled()
  })

  test("a rejected custom field value does not fail the submission", async () => {
    setValues.mockRejectedValue(new Error("invalid number"))
    await expect(
      miniAppSubmissionService.create({
        miniApp,
        contactId: "c-1",
        answers: { full_name: "Ana" },
      }),
    ).resolves.toEqual({ id: "sub-1" })
    expect(warn).toHaveBeenCalled()
  })

  test("swaps upload ids for files and saves their public URLs", async () => {
    const uploadId = "AAAAAAAAAAAAAAAAAAAAAA"
    claimForSubmission.mockResolvedValue([
      {
        uploadId,
        url: "https://cdn/a.jpg",
        name: "a.jpg",
        mimeType: "image/jpeg",
        size: 1,
      },
      {
        uploadId: "B",
        url: "https://cdn/b.jpg",
        name: "b.jpg",
        mimeType: "image/jpeg",
        size: 1,
      },
    ])
    await miniAppSubmissionService.create({
      miniApp,
      contactId: "c-1",
      answers: { photo: [uploadId] },
    })
    expect(claimForSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        contactId: "c-1",
        inputName: "photo",
        uploadIds: [uploadId],
      }),
    )
    expect(setValues).toHaveBeenCalledWith(
      expect.objectContaining({
        fields: [
          {
            customFieldId: "cf-photo",
            value: "https://cdn/a.jpg, https://cdn/b.jpg",
          },
        ],
      }),
    )
  })
})

describe("miniAppSubmissionService.saveScreenAnswers", () => {
  test("saves a screen's mapped answers right away, without files", async () => {
    const saved = await miniAppSubmissionService.saveScreenAnswers({
      miniApp,
      contactId: "c-1",
      screenKey: "s1",
      answers: { full_name: "Ana", photo: ["AAAAAAAAAAAAAAAAAAAAAA"] },
    })
    expect(saved).toBe(true)
    expect(setValues).toHaveBeenCalledTimes(1)
    expect(setValues).toHaveBeenCalledWith(
      expect.objectContaining({
        fields: [{ customFieldId: "cf-name", value: "Ana" }],
      }),
    )
  })

  test("saves nothing for an anonymous visitor or an unknown screen", async () => {
    await expect(
      miniAppSubmissionService.saveScreenAnswers({
        miniApp,
        contactId: null,
        screenKey: "s1",
        answers: { full_name: "Ana" },
      }),
    ).resolves.toBe(false)
    await expect(
      miniAppSubmissionService.saveScreenAnswers({
        miniApp,
        contactId: "c-1",
        screenKey: "missing",
        answers: { full_name: "Ana" },
      }),
    ).resolves.toBe(false)
    expect(setValues).not.toHaveBeenCalled()
  })
})
