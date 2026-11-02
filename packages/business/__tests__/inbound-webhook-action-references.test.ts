import { beforeEach, describe, expect, test, vi } from "vitest"

// The reference rules themselves are tested with the shared validator
// (automation-action-references.test.ts); this adapter only turns its problem
// list into the yes/no the webhook service needs.

const mocks = vi.hoisted(() => ({ findInvalid: vi.fn() }))

vi.mock("../src/automation-action/references", () => ({
  findInvalidActionReferences: mocks.findInvalid,
}))

const { actionReferencesExistInWorkspace } = await import(
  "../src/inbound-webhook/action-references"
)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findInvalid.mockResolvedValue([])
})

describe("actionReferencesExistInWorkspace", () => {
  test("is true when the shared validator finds no problem", async () => {
    const actions = [{ type: "addTag", tagIds: ["1"] }] as never

    await expect(
      actionReferencesExistInWorkspace({ workspaceId: "ws-1", actions }),
    ).resolves.toBe(true)
    expect(mocks.findInvalid).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      actions,
    })
  })

  test("is false as soon as one reference does not resolve", async () => {
    mocks.findInvalid.mockResolvedValue([{ index: 0, field: "tagIds.0" }])

    await expect(
      actionReferencesExistInWorkspace({
        workspaceId: "ws-1",
        actions: [{ type: "addTag", tagIds: ["9"] }] as never,
      }),
    ).resolves.toBe(false)
  })

  test("is true for no actions", async () => {
    await expect(
      actionReferencesExistInWorkspace({ workspaceId: "ws-1", actions: [] }),
    ).resolves.toBe(true)
  })
})
