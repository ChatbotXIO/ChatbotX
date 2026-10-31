// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({ listIdentitiesByIds: vi.fn() }))

vi.mock("@chatbotx.io/database/repositories", () => ({
  inboxRepository: {
    listIdentitiesByIds: (...args: unknown[]) =>
      mocks.listIdentitiesByIds(...args),
  },
}))

const { resolveInboxManifest } = await import(
  "../src/template/adapters/manifests/inboxes"
)

const manifest = {
  "src-1": { channelType: "messenger", name: "Page A" },
  "src-2": { channelType: "instagram", name: "IG" },
}

const makeCtx = (inboxBindings?: Record<string, string>) =>
  ({
    tx: {},
    workspaceId: "ws-1",
    idMaps: {} as Record<string, Map<string, string>>,
    inboxBindings,
  }) as never as Parameters<typeof resolveInboxManifest>[0] & {
    idMaps: Record<string, Map<string, string>>
  }

const inbox = (id: string, channel: string, status = "connected") => ({
  id,
  name: id,
  channel,
  status,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.listIdentitiesByIds.mockResolvedValue([])
})

describe("resolveInboxManifest", () => {
  test("does nothing and queries nothing for a template without inboxes", async () => {
    const ctx = makeCtx()

    await resolveInboxManifest(ctx, {})

    expect(mocks.listIdentitiesByIds).not.toHaveBeenCalled()
    expect(ctx.idMaps.inbox).toBeUndefined()
  })

  test("maps a source inbox to the installer's bound inbox, in one scoped query", async () => {
    mocks.listIdentitiesByIds.mockResolvedValue([inbox("tgt-1", "messenger")])
    const ctx = makeCtx({ "src-1": "tgt-1" })

    await resolveInboxManifest(ctx, { "src-1": manifest["src-1"] })

    expect(ctx.idMaps.inbox?.get("src-1")).toBe("tgt-1")
    expect(mocks.listIdentitiesByIds).toHaveBeenCalledTimes(1)
    expect(mocks.listIdentitiesByIds).toHaveBeenCalledWith(
      { workspaceId: "ws-1", ids: ["tgt-1"] },
      expect.anything(),
    )
  })

  test("fails the install on a binding to an inbox of the wrong channel", async () => {
    mocks.listIdentitiesByIds.mockResolvedValue([inbox("tgt-1", "instagram")])

    await expect(
      resolveInboxManifest(makeCtx({ "src-1": "tgt-1" }), {
        "src-1": manifest["src-1"],
      }),
    ).rejects.toMatchObject({ code: "templateInvalidInboxBinding" })
  })

  test("fails the install on a binding to a disconnected inbox", async () => {
    mocks.listIdentitiesByIds.mockResolvedValue([
      inbox("tgt-1", "messenger", "disconnected"),
    ])

    await expect(
      resolveInboxManifest(makeCtx({ "src-1": "tgt-1" }), {
        "src-1": manifest["src-1"],
      }),
    ).rejects.toMatchObject({ code: "templateInvalidInboxBinding" })
  })

  test("fails the install on a binding to an inbox outside the workspace", async () => {
    // The lookup is scoped to the workspace, so a foreign id comes back absent.
    mocks.listIdentitiesByIds.mockResolvedValue([])

    await expect(
      resolveInboxManifest(makeCtx({ "src-1": "foreign" }), {
        "src-1": manifest["src-1"],
      }),
    ).rejects.toMatchObject({ code: "templateInvalidInboxBinding" })
  })

  test("uses the source id itself when it is a matching inbox of this workspace", async () => {
    mocks.listIdentitiesByIds.mockResolvedValue([inbox("src-1", "messenger")])
    const ctx = makeCtx()

    await resolveInboxManifest(ctx, { "src-1": manifest["src-1"] })

    expect(ctx.idMaps.inbox?.get("src-1")).toBe("src-1")
  })

  test("leaves an unbound inbox unresolved for its adapter to report", async () => {
    const ctx = makeCtx()

    await resolveInboxManifest(ctx, manifest)

    expect(ctx.idMaps.inbox?.size).toBe(0)
  })

  test("resolves each inbox on its own: one bound, one left out", async () => {
    mocks.listIdentitiesByIds.mockResolvedValue([inbox("tgt-1", "messenger")])
    const ctx = makeCtx({ "src-1": "tgt-1" })

    await resolveInboxManifest(ctx, manifest)

    expect([...(ctx.idMaps.inbox ?? [])]).toEqual([["src-1", "tgt-1"]])
  })
})
