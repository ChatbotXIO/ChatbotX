import { beforeEach, describe, expect, test, vi } from "vitest"

const { updateReturning, setValues, findById, warn, claimForSubmission } =
  vi.hoisted(() => ({
    updateReturning: vi.fn(),
    setValues: vi.fn(),
    findById: vi.fn(),
    warn: vi.fn(),
    claimForSubmission: vi.fn(),
  }))

const tx = {
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
  contactCustomFieldService: { setValues },
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
        terminal: true,
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
})

describe("miniAppSubmissionService.create — custom fields", () => {
  test("writes mapped answers to the contact's custom fields", async () => {
    await miniAppSubmissionService.create({
      miniApp,
      contactId: "c-1",
      answers: { full_name: "Ana", topics: ["a", "b"], note: "unmapped" },
      sourceTimezone: "Asia/Ho_Chi_Minh",
    })
    expect(setValues).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "c-1",
      fields: [
        { customFieldId: "cf-name", value: "Ana" },
        { customFieldId: "cf-topics", value: "a, b" },
      ],
      sourceTimezone: "Asia/Ho_Chi_Minh",
    })
  })

  test("does not write anything for an anonymous submission", async () => {
    await miniAppSubmissionService.create({
      miniApp,
      contactId: null,
      answers: { full_name: "Ana" },
    })
    expect(setValues).not.toHaveBeenCalled()
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
