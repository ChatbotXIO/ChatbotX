import { getAuditActor, SYSTEM_ACTOR } from "@chatbotx.io/business/audit"
import { describe, expect, test } from "vitest"
import { runJobWithAuditContext } from "../src/lib/run-job-with-audit-context"

describe("runJobWithAuditContext", () => {
  test("populates the audit actor from the given params", async () => {
    const actor = await runJobWithAuditContext(
      {
        workspaceId: "workspace-1",
        requestedUserId: "user-1",
        source: "schedule:finalizeBroadcasts",
      },
      () => Promise.resolve(getAuditActor()),
    )

    expect(actor).toEqual({
      userId: "user-1",
      workspaceId: "workspace-1",
      source: "schedule:finalizeBroadcasts",
    })
  })

  test("defaults the actor to SYSTEM_ACTOR when requestedUserId is omitted", async () => {
    const actor = await runJobWithAuditContext(
      { workspaceId: "workspace-1", source: "schedule:purgeWorkspaces" },
      () => Promise.resolve(getAuditActor()),
    )

    expect(actor?.userId).toBe(SYSTEM_ACTOR)
  })

  test("keeps concurrent job contexts isolated", async () => {
    const [first, second] = await Promise.all([
      runJobWithAuditContext(
        { workspaceId: "workspace-1", source: "job-one" },
        () => Promise.resolve(getAuditActor()),
      ),
      runJobWithAuditContext(
        { workspaceId: "workspace-2", source: "job-two" },
        () => Promise.resolve(getAuditActor()),
      ),
    ])

    expect(first?.workspaceId).toBe("workspace-1")
    expect(first?.source).toBe("job-one")
    expect(second?.workspaceId).toBe("workspace-2")
    expect(second?.source).toBe("job-two")
  })

  test("does not leak context after the wrapped function resolves", async () => {
    await runJobWithAuditContext(
      { workspaceId: "workspace-1", source: "job-one" },
      () => Promise.resolve(getAuditActor()),
    )

    expect(getAuditActor()).toBeUndefined()
  })
})
