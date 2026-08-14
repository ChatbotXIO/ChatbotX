import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { beforeEach, describe, expect, test, vi } from "vitest"
import type { ChatbotXException } from "../src/errors"

const mocks = vi.hoisted(() => ({
  setValues: vi.fn(async () => undefined),
}))

vi.mock("../src/contact-custom-field/service", () => ({
  contactCustomFieldService: { setValues: mocks.setValues },
}))

const { javascriptExecutionService } = await import(
  "../src/javascript-execution/service"
)

const EXECUTOR_URL = `${process.env.JAVASCRIPT_EXECUTOR_URL}/execute`

const respondWithValue = (value: unknown): void => {
  server.use(http.post(EXECUTOR_URL, () => HttpResponse.json({ value })))
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("javascriptExecutionService", () => {
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

  test("maps the returned value into contact custom fields", async () => {
    respondWithValue({ profile: { name: "Ada" }, active: true })

    await javascriptExecutionService.executeAndMap({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      code: "return { profile: { name: input.name }, active: true }",
      input: { name: "Ada" },
      mapping: [
        { jsonPath: "profile.name", outputFieldId: "field-name" },
        { jsonPath: "active", outputFieldId: "field-active" },
      ],
    })

    expect(mocks.setValues).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      fields: [
        { customFieldId: "field-name", value: "Ada" },
        { customFieldId: "field-active", value: "true" },
      ],
    })
  })

  test("maps a small field from a result larger than one custom field", async () => {
    respondWithValue({ ignored: "x".repeat(128 * 1024), selected: "Ada" })

    await javascriptExecutionService.executeAndMap({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      code: "return input",
      input: {},
      mapping: [{ jsonPath: "selected", outputFieldId: "field-name" }],
    })

    expect(mocks.setValues).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      fields: [{ customFieldId: "field-name", value: "Ada" }],
    })
  })

  test("skips a jsonPath mapping when the returned value is a primitive", async () => {
    respondWithValue("hello")

    await javascriptExecutionService.executeAndMap({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      code: "return 'hello'",
      input: {},
      mapping: [{ jsonPath: "name", outputFieldId: "field-name" }],
    })

    expect(mocks.setValues).not.toHaveBeenCalled()
  })

  test("maps the whole primitive value when jsonPath is blank", async () => {
    respondWithValue("hello")

    await javascriptExecutionService.executeAndMap({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      code: "return 'hello'",
      input: {},
      mapping: [{ jsonPath: "", outputFieldId: "field-name" }],
    })

    expect(mocks.setValues).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      fields: [{ customFieldId: "field-name", value: "hello" }],
    })
  })

  test("throws a typed exception when the output is too large to save", async () => {
    respondWithValue("a".repeat(64 * 1024 + 1))

    await expect(
      javascriptExecutionService.executeAndMap({
        workspaceId: "workspace-1",
        contactId: "contact-1",
        code: 'return "a".repeat(64 * 1024 + 1)',
        input: {},
        mapping: [{ jsonPath: "", outputFieldId: "field-name" }],
      }),
    ).rejects.toMatchObject<Partial<ChatbotXException>>({
      code: "javascriptOutputTooLarge",
    })
  })
})
