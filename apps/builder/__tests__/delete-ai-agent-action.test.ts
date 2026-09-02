// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

// ── business spies ──────────────────────────────────────────────────────────
const aiAgentDelete = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  aiAgentService: {
    delete: (...args: unknown[]) => aiAgentDelete(...args),
  },
}))

vi.mock("@/features/common/schema", () => ({
  bulkUpdateIdsRequest: {},
  workspaceIdrequestParams: [],
}))

// ── safe-action client spies ────────────────────────────────────────────────
// `deleteAIAgentAction` must be built on `workspaceActionClientAllowExpired`
// (which verifies the caller is a member of the bound workspaceId before
// running) rather than the bare `authActionClient` (which only checks the
// caller is logged in). Using `authActionClient` here was a cross-tenant IDOR:
// any authenticated user could delete AI Agents in a workspace they don't
// belong to by invoking the action with an arbitrary workspaceId bind arg.
// It also silently broke audit logging, since only the workspace-scoped
// client attaches `workspaceId` to the audit context — see
// docs/audit_log/AUDIT-LOG-OVERVIEW.md, "AI Agent Logs".
function makeClientStub(name: string) {
  return {
    bindArgsSchemas: (...bindArgs: unknown[]) => ({
      inputSchema: (...inputArgs: unknown[]) => ({
        action: (
          handler: (props: {
            bindArgsParsedInputs: unknown[]
            parsedInput: unknown
          }) => unknown,
        ) => ({
          __client: name,
          __bindArgs: bindArgs,
          __inputArgs: inputArgs,
          __handler: handler,
        }),
      }),
    }),
  }
}

vi.mock("@/lib/safe-action", () => ({
  authActionClient: makeClientStub("authActionClient"),
  workspaceActionClientAllowExpired: makeClientStub(
    "workspaceActionClientAllowExpired",
  ),
}))

const { deleteAIAgentAction } = (await import(
  "../src/features/ai-agents/actions/delete.action"
)) as unknown as {
  deleteAIAgentAction: {
    __client: string
    __handler: (props: unknown) => unknown
  }
}

beforeEach(() => {
  aiAgentDelete.mockClear()
})

describe("deleteAIAgentAction", () => {
  test("is built on the workspace-scoped client, not the bare auth client", () => {
    expect(deleteAIAgentAction.__client).toBe(
      "workspaceActionClientAllowExpired",
    )
  })

  test("calls aiAgentService.delete with the bound workspaceId and requested ids", async () => {
    await deleteAIAgentAction.__handler({
      bindArgsParsedInputs: ["ws-1"],
      parsedInput: { ids: ["agent-1", "agent-2"] },
    })

    expect(aiAgentDelete).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      ids: ["agent-1", "agent-2"],
    })
  })
})
