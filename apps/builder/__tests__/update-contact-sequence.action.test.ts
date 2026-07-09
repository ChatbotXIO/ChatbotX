// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  findByIdOrFailSpy,
  requireContactPermissionScopeSpy,
  updateContactSequencesSpy,
} = vi.hoisted(() => ({
  findByIdOrFailSpy: vi.fn(),
  requireContactPermissionScopeSpy: vi.fn(),
  updateContactSequencesSpy: vi.fn(),
}))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (fn: unknown) => fn
  return { workspaceActionClient: chain }
})

vi.mock("@chatbotx.io/business", () => ({
  contactService: {
    findByIdOrFail: findByIdOrFailSpy,
  },
}))

vi.mock("@chatbotx.io/business/contact-sequence", () => ({
  contactSequenceService: {
    updateContactSequences: updateContactSequencesSpy,
  },
}))

vi.mock("../src/features/contacts/permissions", () => ({
  requireContactPermissionScope: requireContactPermissionScopeSpy,
}))

vi.mock("../src/features/contact-sequences/schema", () => ({
  updateContactSequenceRequest: {},
}))

const { updateContactSequenceAction } = await import(
  "../src/features/contact-sequences/actions/update-contact-sequence.action"
)

type ActionHandler = (args: {
  bindArgsParsedInputs: [string]
  parsedInput: { contactId: string; sequences: string[] }
}) => Promise<unknown>

const callAction = updateContactSequenceAction as unknown as ActionHandler
const WORKSPACE_ID = "ws-1"

describe("updateContactSequenceAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findByIdOrFailSpy.mockResolvedValue({ id: "contact-1" })
    requireContactPermissionScopeSpy.mockResolvedValue({
      restrictToAssignedUserId: "user-1",
    })
    updateContactSequencesSpy.mockResolvedValue([
      { id: "enrollment-1", sequence: { id: "sequence-1" } },
    ])
  })

  test("delegates sequence update to the business service after loading the contact", async () => {
    const result = await callAction({
      bindArgsParsedInputs: [WORKSPACE_ID],
      parsedInput: { contactId: "contact-1", sequences: ["sequence-1"] },
    })

    expect(findByIdOrFailSpy).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      id: "contact-1",
      accessScope: { restrictToAssignedUserId: "user-1" },
    })
    expect(updateContactSequencesSpy).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      contactId: "contact-1",
      sequenceIds: ["sequence-1"],
    })
    expect(result).toEqual([
      { id: "enrollment-1", sequence: { id: "sequence-1" } },
    ])
  })
})
