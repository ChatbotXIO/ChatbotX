// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const FIELDS_LABEL_PREFIX = "fields."
const FIELDS_LABEL_SUFFIX = ".label"

// Fake translator: resolves `fields.<key>.label` to a readable label and
// renders `messages.nameAlreadyExists` with the interpolated `feature`, so
// assertions can check the actual rendered (translated) string instead of
// just the raw exception message passing through untouched.
function fakeTranslate(key: string, params?: Record<string, string>) {
  if (key === "messages.nameAlreadyExists") {
    return `${params?.feature} name already exists`
  }
  if (
    key.startsWith(FIELDS_LABEL_PREFIX) &&
    key.endsWith(FIELDS_LABEL_SUFFIX)
  ) {
    return key.slice(
      FIELDS_LABEL_PREFIX.length,
      key.length - FIELDS_LABEL_SUFFIX.length,
    )
  }
  return key
}

const { mockReturnValidationErrors, mockGetTranslations } = vi.hoisted(() => ({
  mockReturnValidationErrors: vi
    .fn()
    .mockReturnValue({ __validationError: true }),
  mockGetTranslations: vi.fn(),
}))

vi.mock("next-safe-action", () => ({
  returnValidationErrors: mockReturnValidationErrors,
}))

vi.mock("next-intl/server", () => ({
  getTranslations: mockGetTranslations,
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {
    code: string
    httpStatusCode: number
    constructor(message: string, code = "systemError", httpStatusCode = 400) {
      super(message)
      this.name = "ChatbotXException"
      this.code = code
      this.httpStatusCode = httpStatusCode
    }
  },
}))

const { mapExceptionToFieldError } = await import("@/lib/action-field-error")
const { ChatbotXException } = await import("@chatbotx.io/business/errors")

const fakeSchema = { __schema: "fake" } as never

beforeEach(() => {
  vi.clearAllMocks()
  mockGetTranslations.mockResolvedValue(fakeTranslate)
})

describe("mapExceptionToFieldError", () => {
  test("returns the run result untouched when it succeeds", async () => {
    const result = await mapExceptionToFieldError(
      fakeSchema,
      "name",
      () => Promise.resolve("ok"),
      "tag",
    )

    expect(result).toBe("ok")
    expect(mockReturnValidationErrors).not.toHaveBeenCalled()
  })

  test("turns a ChatbotXException with a matching code into a translated field error", async () => {
    const run = () =>
      Promise.reject(
        new ChatbotXException("Name is already taken", "nameTaken", 400),
      )

    const result = await mapExceptionToFieldError(
      fakeSchema,
      "name",
      run,
      "tag",
    )

    expect(mockReturnValidationErrors).toHaveBeenCalledWith(fakeSchema, {
      name: { _errors: ["tag name already exists"] },
    })
    expect(result).toEqual({ __validationError: true })
  })

  test("rethrows a ChatbotXException whose code is not in the allow-list", async () => {
    const run = () =>
      Promise.reject(
        new ChatbotXException(
          "Workspace deletion scheduled",
          "workspaceScheduledDeletion",
          403,
        ),
      )

    await expect(
      mapExceptionToFieldError(fakeSchema, "name", run, "tag"),
    ).rejects.toMatchObject({ code: "workspaceScheduledDeletion" })
    expect(mockReturnValidationErrors).not.toHaveBeenCalled()
  })

  test("rethrows a non-ChatbotXException error untouched", async () => {
    const run = () => Promise.reject(new Error("boom"))

    await expect(
      mapExceptionToFieldError(fakeSchema, "name", run, "tag"),
    ).rejects.toThrow("boom")
    expect(mockReturnValidationErrors).not.toHaveBeenCalled()
  })

  test("honors a custom codes list", async () => {
    const run = () =>
      Promise.reject(new ChatbotXException("Custom taken", "customCode", 400))

    await mapExceptionToFieldError(fakeSchema, "name", run, "customField", [
      "customCode",
    ])

    expect(mockReturnValidationErrors).toHaveBeenCalledWith(fakeSchema, {
      name: { _errors: ["customField name already exists"] },
    })
  })
})
