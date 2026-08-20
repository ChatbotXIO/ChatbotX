import type { CustomFieldType } from "@chatbotx.io/database/partials"
import { MAX_CODE_LENGTH as FLOW_CONFIG_MAX_CODE_LENGTH } from "@chatbotx.io/flow-config"
import { MAX_CODE_LENGTH as SANDBOX_MAX_CODE_LENGTH } from "@chatbotx.io/javascript-sandbox"
import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { beforeEach, describe, expect, test, vi } from "vitest"
import type { ChatbotXException } from "../src/errors"

const mocks = vi.hoisted(() => ({
  setValues: vi.fn(async () => undefined),
  findBy: vi.fn(
    async () =>
      ({ id: "field-name", name: "field-name", type: "shortText" }) as const,
  ),
}))

vi.mock("../src/contact-custom-field/service", () => ({
  contactCustomFieldService: { setValues: mocks.setValues },
}))

vi.mock("../src/custom-field/service", () => ({
  customFieldService: { findBy: mocks.findBy },
}))

const { javascriptExecutionService } = await import(
  "../src/javascript-execution/service"
)

const EXECUTOR_URL = `${process.env.JAVASCRIPT_EXECUTOR_URL}/execute`

const respondWithValue = (value: unknown): void => {
  server.use(http.post(EXECUTOR_URL, () => HttpResponse.json({ value })))
}

/** Points the mocked lookup at a field of the given type for one test. */
const withOutputField = (props: {
  id?: string
  name?: string
  type: CustomFieldType
}): void => {
  mocks.findBy.mockResolvedValueOnce({
    id: props.id ?? "field-name",
    name: props.name ?? "field-name",
    type: props.type,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findBy.mockResolvedValue({
    id: "field-name",
    name: "field-name",
    type: "shortText",
  })
})

describe("javascriptExecutionService", () => {
  test("flow-config and javascript-sandbox agree on MAX_CODE_LENGTH", () => {
    expect(FLOW_CONFIG_MAX_CODE_LENGTH).toBe(SANDBOX_MAX_CODE_LENGTH)
  })

  test("executes JavaScript through the remote executor", async () => {
    server.use(
      http.post(EXECUTOR_URL, async ({ request }) => {
        await expect(request.json()).resolves.toEqual({
          code: "return input.answer",
          input: { answer: 42 },
        })
        return HttpResponse.json({ value: 42 })
      }),
    )

    await expect(
      javascriptExecutionService.execute({
        code: "return input.answer",
        input: { answer: 42 },
      }),
    ).resolves.toEqual({ value: 42 })
  })

  test("preserves typed executor error codes", async () => {
    server.use(
      http.post(EXECUTOR_URL, () =>
        HttpResponse.json(
          {
            error: {
              code: "javascriptTimeout",
              message: "JavaScript execution timed out",
            },
          },
          { status: 422 },
        ),
      ),
    )

    await expect(
      javascriptExecutionService.execute({
        code: "while (true) {}",
        input: {},
      }),
    ).rejects.toMatchObject<Partial<ChatbotXException>>({
      code: "javascriptTimeout",
      message: "JavaScript execution timed out",
    })
  })

  test("maps transport failures to a typed execution exception", async () => {
    server.use(http.post(EXECUTOR_URL, () => HttpResponse.error()))

    await expect(
      javascriptExecutionService.execute({ code: "return 1", input: {} }),
    ).rejects.toMatchObject<Partial<ChatbotXException>>({
      code: "javascriptExecutionFailed",
    })
  })

  test("maps the whole returned value into a shortText output custom field", async () => {
    withOutputField({ type: "shortText" })
    respondWithValue({ profile: { name: "Ada" }, active: true })

    await javascriptExecutionService.executeAndMap({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      code: "return { profile: { name: input.name }, active: true }",
      input: { name: "Ada" },
      customFieldId: "field-name",
    })

    expect(mocks.setValues).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      fields: [
        {
          customFieldId: "field-name",
          value: JSON.stringify({ profile: { name: "Ada" }, active: true }),
        },
      ],
      temporalInputParsing: "lenient",
    })
  })

  test("maps a primitive value directly to a shortText output custom field", async () => {
    withOutputField({ type: "shortText" })
    respondWithValue("hello")

    await javascriptExecutionService.executeAndMap({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      code: "return 'hello'",
      input: {},
      customFieldId: "field-name",
    })

    expect(mocks.setValues).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      fields: [{ customFieldId: "field-name", value: "hello" }],
      temporalInputParsing: "lenient",
    })
  })

  test("skips the write when the returned value is null or undefined", async () => {
    respondWithValue(null)

    await javascriptExecutionService.executeAndMap({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      code: "return null",
      input: {},
      customFieldId: "field-name",
    })

    expect(mocks.setValues).not.toHaveBeenCalled()
  })

  test("throws a typed exception when the output is too large to save", async () => {
    withOutputField({ type: "longText" })
    respondWithValue("a".repeat(64 * 1024 + 1))

    await expect(
      javascriptExecutionService.executeAndMap({
        workspaceId: "workspace-1",
        contactId: "contact-1",
        code: 'return "a".repeat(64 * 1024 + 1)',
        input: {},
        customFieldId: "field-name",
      }),
    ).rejects.toMatchObject<Partial<ChatbotXException>>({
      code: "javascriptOutputValueTooLarge",
    })
  })

  test("throws when the returned value cannot resolve the output field", async () => {
    mocks.findBy.mockResolvedValueOnce(undefined)

    server.use(http.post(EXECUTOR_URL, () => HttpResponse.error()))

    await expect(
      javascriptExecutionService.executeAndMap({
        workspaceId: "workspace-1",
        contactId: "contact-1",
        code: "return 1",
        input: {},
        customFieldId: "stale-field",
      }),
    ).rejects.toMatchObject<Partial<ChatbotXException>>({
      code: "notFound",
    })

    // The sandbox must never run when the target field no longer exists.
    expect(mocks.setValues).not.toHaveBeenCalled()
  })

  describe("output type validation", () => {
    test("accepts a JS number into a number field", async () => {
      withOutputField({ type: "number" })
      respondWithValue(42)

      await javascriptExecutionService.executeAndMap({
        workspaceId: "workspace-1",
        contactId: "contact-1",
        code: "return 42",
        input: {},
        customFieldId: "field-name",
      })

      expect(mocks.setValues).toHaveBeenCalledWith(
        expect.objectContaining({
          fields: [{ customFieldId: "field-name", value: "42" }],
        }),
      )
    })

    test("accepts a numeric string into a number field", async () => {
      withOutputField({ type: "number" })
      respondWithValue("42")

      await javascriptExecutionService.executeAndMap({
        workspaceId: "workspace-1",
        contactId: "contact-1",
        code: 'return "42"',
        input: {},
        customFieldId: "field-name",
      })

      expect(mocks.setValues).toHaveBeenCalledWith(
        expect.objectContaining({
          fields: [{ customFieldId: "field-name", value: "42" }],
        }),
      )
    })

    test("rejects a non-numeric string into a number field", async () => {
      withOutputField({ type: "number", name: "Age" })
      respondWithValue("Abcd 123")

      await expect(
        javascriptExecutionService.executeAndMap({
          workspaceId: "workspace-1",
          contactId: "contact-1",
          code: 'return "Abcd 123"',
          input: {},
          customFieldId: "field-name",
        }),
      ).rejects.toMatchObject<Partial<ChatbotXException>>({
        code: "javascriptOutputTypeMismatch",
        message: expect.stringContaining('"Abcd 123"') as unknown as string,
      })

      expect(mocks.setValues).not.toHaveBeenCalled()
    })

    test("accepts a JS boolean into a boolean field", async () => {
      withOutputField({ type: "boolean" })
      respondWithValue(true)

      await javascriptExecutionService.executeAndMap({
        workspaceId: "workspace-1",
        contactId: "contact-1",
        code: "return true",
        input: {},
        customFieldId: "field-name",
      })

      expect(mocks.setValues).toHaveBeenCalledWith(
        expect.objectContaining({
          fields: [{ customFieldId: "field-name", value: "true" }],
        }),
      )
    })

    test("rejects an arbitrary string into a boolean field", async () => {
      withOutputField({ type: "boolean" })
      respondWithValue("garbage")

      await expect(
        javascriptExecutionService.executeAndMap({
          workspaceId: "workspace-1",
          contactId: "contact-1",
          code: 'return "garbage"',
          input: {},
          customFieldId: "field-name",
        }),
      ).rejects.toMatchObject<Partial<ChatbotXException>>({
        code: "javascriptOutputTypeMismatch",
      })

      expect(mocks.setValues).not.toHaveBeenCalled()
    })

    test("normalizes a valid email into an email field", async () => {
      withOutputField({ type: "email" })
      respondWithValue("Foo@Bar.COM")

      await javascriptExecutionService.executeAndMap({
        workspaceId: "workspace-1",
        contactId: "contact-1",
        code: 'return "Foo@Bar.COM"',
        input: {},
        customFieldId: "field-name",
      })

      expect(mocks.setValues).toHaveBeenCalledWith(
        expect.objectContaining({
          fields: [{ customFieldId: "field-name", value: "foo@bar.com" }],
        }),
      )
    })

    test("rejects a non-email value into an email field", async () => {
      withOutputField({ type: "email" })
      respondWithValue(42)

      await expect(
        javascriptExecutionService.executeAndMap({
          workspaceId: "workspace-1",
          contactId: "contact-1",
          code: "return 42",
          input: {},
          customFieldId: "field-name",
        }),
      ).rejects.toMatchObject<Partial<ChatbotXException>>({
        code: "javascriptOutputTypeMismatch",
      })

      expect(mocks.setValues).not.toHaveBeenCalled()
    })

    test("normalizes a valid phone number into a phoneNumber field", async () => {
      withOutputField({ type: "phoneNumber" })
      respondWithValue("+1 (555) 123-4567")

      await javascriptExecutionService.executeAndMap({
        workspaceId: "workspace-1",
        contactId: "contact-1",
        code: 'return "+1 (555) 123-4567"',
        input: {},
        customFieldId: "field-name",
      })

      expect(mocks.setValues).toHaveBeenCalledWith(
        expect.objectContaining({
          fields: [{ customFieldId: "field-name", value: "+15551234567" }],
        }),
      )
    })

    test("hands a parseable datetime through raw with Lenient parsing", async () => {
      withOutputField({ type: "datetime" })
      respondWithValue("2026-07-22T10:00:00Z")

      await javascriptExecutionService.executeAndMap({
        workspaceId: "workspace-1",
        contactId: "contact-1",
        code: 'return "2026-07-22T10:00:00Z"',
        input: {},
        customFieldId: "field-name",
      })

      expect(mocks.setValues).toHaveBeenCalledWith({
        workspaceId: "workspace-1",
        contactId: "contact-1",
        fields: [
          { customFieldId: "field-name", value: "2026-07-22T10:00:00Z" },
        ],
        temporalInputParsing: "lenient",
      })
    })

    test("rejects an unparseable datetime", async () => {
      withOutputField({ type: "datetime" })
      respondWithValue("not a date")

      await expect(
        javascriptExecutionService.executeAndMap({
          workspaceId: "workspace-1",
          contactId: "contact-1",
          code: 'return "not a date"',
          input: {},
          customFieldId: "field-name",
        }),
      ).rejects.toMatchObject<Partial<ChatbotXException>>({
        code: "javascriptOutputTypeMismatch",
      })

      expect(mocks.setValues).not.toHaveBeenCalled()
    })

    test("rejects an empty string into a non-text field", async () => {
      withOutputField({ type: "number" })
      respondWithValue("")

      await expect(
        javascriptExecutionService.executeAndMap({
          workspaceId: "workspace-1",
          contactId: "contact-1",
          code: 'return ""',
          input: {},
          customFieldId: "field-name",
        }),
      ).rejects.toMatchObject<Partial<ChatbotXException>>({
        code: "javascriptOutputTypeMismatch",
      })

      expect(mocks.setValues).not.toHaveBeenCalled()
    })

    test("accepts an empty string into a text field", async () => {
      withOutputField({ type: "shortText" })
      respondWithValue("")

      await javascriptExecutionService.executeAndMap({
        workspaceId: "workspace-1",
        contactId: "contact-1",
        code: 'return ""',
        input: {},
        customFieldId: "field-name",
      })

      expect(mocks.setValues).toHaveBeenCalledWith(
        expect.objectContaining({
          fields: [{ customFieldId: "field-name", value: "" }],
        }),
      )
    })
  })
})
