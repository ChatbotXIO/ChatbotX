// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const { unsubscribeContactsSpy, requireContactPermissionScopeSpy } = vi.hoisted(
  () => ({
    unsubscribeContactsSpy: vi.fn(),
    requireContactPermissionScopeSpy: vi.fn(),
  }),
)

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (fn: unknown) => fn
  return { workspaceActionClient: chain }
})

vi.mock("@chatbotx.io/business/contact-sequence", () => ({
  contactSequenceService: {
    unsubscribeContacts: unsubscribeContactsSpy,
  },
}))

vi.mock("../src/features/contacts/permissions", () => ({
  requireContactPermissionScope: requireContactPermissionScopeSpy,
}))

const { removeContactSequenceAction } = await import(
  "../src/features/contacts/actions/remove-contact-sequence.action"
)

type ActionHandler = (args: {
  bindArgsParsedInputs: [string]
  parsedInput: { ids: string[]; sequences: string[] }
}) => Promise<unknown>

const callAction = removeContactSequenceAction as unknown as ActionHandler
const WORKSPACE_ID = "ws-1"

// Chunking, the workspace check on sequences and the skipped-id report live in
// `contactSequenceService.unsubscribeContacts` (covered by the business tests),
// shared with the public bulk-unsubscribe route.
describe("removeContactSequenceAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    unsubscribeContactsSpy.mockResolvedValue({
      processedContactIds: [],
      skippedContactIds: [],
    })
    requireContactPermissionScopeSpy.mockResolvedValue({
      restrictToAssignedUserId: "user-1",
    })
  })

  test("delegates to the shared service with the member's access scope", async () => {
    await callAction({
      bindArgsParsedInputs: [WORKSPACE_ID],
      parsedInput: { ids: ["contact-1"], sequences: ["sequence-1"] },
    })

    expect(unsubscribeContactsSpy).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      contactIds: ["contact-1"],
      sequenceIds: ["sequence-1"],
      accessScope: { restrictToAssignedUserId: "user-1" },
    })
  })

  test("does not touch any subscription when the permission check fails", async () => {
    requireContactPermissionScopeSpy.mockRejectedValueOnce(
      new Error("forbidden"),
    )

    await expect(
      callAction({
        bindArgsParsedInputs: [WORKSPACE_ID],
        parsedInput: { ids: ["contact-1"], sequences: ["sequence-1"] },
      }),
    ).rejects.toThrow("forbidden")

    expect(unsubscribeContactsSpy).not.toHaveBeenCalled()
  })
})
