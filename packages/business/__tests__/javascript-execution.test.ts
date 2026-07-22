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

beforeEach(() => {
  vi.clearAllMocks()
})

describe("javascriptExecutionService", () => {
  test("executes pure JavaScript against a copied input", async () => {
    await expect(
      javascriptExecutionService.execute({
        code: "return { greeting: input.firstName.toUpperCase() }",
        input: { firstName: "Ada" },
      }),
    ).resolves.toEqual({ value: { greeting: "ADA" } })
  })

  test("does not expose Node or network globals", async () => {
    await expect(
      javascriptExecutionService.execute({
        code: "return [typeof fetch, typeof require, typeof process, typeof globalThis.process]",
        input: {},
      }),
    ).resolves.toEqual({
      value: ["undefined", "undefined", "undefined", "undefined"],
    })
  })

  test("throws a typed exception when code times out", async () => {
    await expect(
      javascriptExecutionService.execute({
        code: "while (true) {}",
        input: {},
      }),
    ).rejects.toMatchObject<Partial<ChatbotXException>>({
      code: "javascriptTimeout",
    })
  })

  test("throws a typed exception for a script error", async () => {
    await expect(
      javascriptExecutionService.execute({
        code: 'throw new Error("broken")',
        input: {},
      }),
    ).rejects.toMatchObject<Partial<ChatbotXException>>({
      code: "javascriptExecutionFailed",
    })
  })

  test("maps the returned value into contact custom fields", async () => {
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

  test("skips a jsonPath mapping when the returned value is a primitive", async () => {
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
