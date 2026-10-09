import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({ resolveContactVariablesDeep: vi.fn() }))

vi.mock("@chatbotx.io/variables", () => ({
  resolveContactVariablesDeep: mocks.resolveContactVariablesDeep,
}))

const { resolveMatchingTemplates } = await import(
  "../src/integration/handlers/google-ads/resolve-matching-templates"
)

const contactInbox = { id: "ci-1", contactId: "c-1" } as never
const call = (templates: { email: string | null; phone: string | null }) =>
  resolveMatchingTemplates({ contactId: "c-1", contactInbox, templates })

describe("resolveMatchingTemplates", () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  test("resolves both variables in one call against the contact and its inbox", async () => {
    mocks.resolveContactVariablesDeep.mockResolvedValue({
      email: "jane@example.com",
      phone: "+14155552671",
    })

    expect(await call({ email: "{{email}}", phone: "{{phone}}" })).toEqual({
      email: "jane@example.com",
      phone: "+14155552671",
    })
    expect(mocks.resolveContactVariablesDeep).toHaveBeenCalledTimes(1)
    expect(mocks.resolveContactVariablesDeep).toHaveBeenCalledWith(
      "c-1",
      { email: "{{email}}", phone: "{{phone}}" },
      { contactInbox },
    )
  })

  test.each([
    ["an empty value", ""],
    ["whitespace", "   "],
    ["a variable that did not resolve", "{{unknown}}"],
    ["no template at all", null],
  ])("%s is no value", async (_label, resolved) => {
    mocks.resolveContactVariablesDeep.mockResolvedValue({
      email: resolved,
      phone: resolved,
    })

    expect(await call({ email: "{{email}}", phone: "{{phone}}" })).toEqual({
      email: null,
      phone: null,
    })
  })

  test("a failure propagates so the delivery is retried", async () => {
    mocks.resolveContactVariablesDeep.mockRejectedValue(new Error("db down"))

    await expect(call({ email: "{{email}}", phone: null })).rejects.toThrow(
      "db down",
    )
  })
})
