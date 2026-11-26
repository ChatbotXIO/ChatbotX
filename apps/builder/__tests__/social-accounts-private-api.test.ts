// @vitest-environment node

import { describe, expect, test, vi } from "vitest"

type Handler = (args: unknown) => Promise<unknown>

const { captured, authorizedGate, operations, permissionGate } = vi.hoisted(
  () => {
    const captured: {
      handler?: Handler
      method: string
      path: string
      use: { middleware: unknown }[]
    }[] = []
    const authorizedGate = { kind: "authorized" }
    const permissionGate = (key: string) => ({ kind: "permission", key })
    const operations = {
      disconnect: vi.fn(),
      get: vi.fn(),
      list: vi.fn(),
      syncDestinations: vi.fn(),
      verify: vi.fn(),
    }
    return { authorizedGate, captured, operations, permissionGate }
  },
)

vi.mock("@/features/social-accounts/lib/social-account-operations", () => ({
  socialAccountOperations: operations,
}))
vi.mock("@/middlewares/auth", () => ({
  workspaceAuthorizedMidddleware: authorizedGate,
  workspacePermissionMiddleware: permissionGate,
}))
vi.mock("@/orpc", () => {
  const makeProcedure = (config: { method: string; path: string }) => {
    const uses: { middleware: unknown }[] = []
    const entry: (typeof captured)[number] = {
      method: config.method,
      path: config.path,
      use: uses,
    }
    const chain = {
      handler: vi.fn((handler: Handler) => {
        entry.handler = handler
        return { uses }
      }),
      input: vi.fn(() => chain),
      output: vi.fn(() => chain),
      use: vi.fn((middleware: unknown) => {
        uses.push({ middleware })
        return chain
      }),
    }
    captured.push(entry)
    return chain
  }
  return {
    authorizedAPI: {
      route: (config: { method: string; path: string }) =>
        makeProcedure(config),
    },
  }
})

const { socialAccountsAPIs } = await import(
  "@/features/social-accounts/api/private"
)

const gates = (procedure: (typeof captured)[number]) =>
  procedure.use.map(({ middleware }) => middleware)

describe("the Posts page's social account procedures", () => {
  test("there are the four procedures the Connect tab calls", () => {
    expect(Object.keys(socialAccountsAPIs)).toEqual([
      "privateListSocialAccountsAPI",
      "privateVerifySocialAccountAPI",
      "privateSyncSocialAccountDestinationsAPI",
      "privateDisconnectSocialAccountAPI",
    ])
  })

  test("every procedure checks the workspace, then the broadcast permission", () => {
    expect(captured).toHaveLength(4)
    for (const procedure of captured) {
      expect(gates(procedure)[0]).toBe(authorizedGate)
      expect(gates(procedure)[1]).toEqual({
        key: "broadcast",
        kind: "permission",
      })
    }
  })

  test("disconnecting needs a super admin on top of the page permission", () => {
    const disconnect = captured.find(
      (procedure) => procedure.method === "DELETE",
    )

    expect(gates(disconnect as (typeof captured)[number])).toEqual([
      authorizedGate,
      { key: "broadcast", kind: "permission" },
      { key: "superAdmin", kind: "permission" },
    ])
  })

  test("the read and verify procedures need no more than the page permission", () => {
    for (const procedure of captured.filter(
      (entry) => entry.method !== "DELETE",
    )) {
      expect(gates(procedure)).toHaveLength(2)
    }
  })

  test("there is no connect procedure: connecting is a session-only redirect", () => {
    expect(
      captured.some((procedure) => procedure.path.endsWith("/connect")),
    ).toBe(false)
  })
})

describe("procedure handlers call the shared operations with the workspace of the request", () => {
  const handlerFor = (method: string, suffix = "") =>
    captured.find(
      (procedure) =>
        procedure.method === method && procedure.path.endsWith(suffix),
    )?.handler

  test("verify", async () => {
    await handlerFor(
      "POST",
      "/verify",
    )?.({ input: { id: "9", workspaceId: "ws-1" } })

    expect(operations.verify).toHaveBeenCalledWith({
      id: "9",
      workspaceId: "ws-1",
    })
  })

  test("sync destinations", async () => {
    await handlerFor(
      "POST",
      "/sync-destinations",
    )?.({
      input: { id: "9", workspaceId: "ws-1" },
    })

    expect(operations.syncDestinations).toHaveBeenCalledWith({
      id: "9",
      workspaceId: "ws-1",
    })
  })

  test("disconnect", async () => {
    await handlerFor("DELETE")?.({ input: { id: "9", workspaceId: "ws-1" } })

    expect(operations.disconnect).toHaveBeenCalledWith({
      id: "9",
      workspaceId: "ws-1",
    })
  })

  test("list wraps the accounts of the workspace", async () => {
    operations.list.mockResolvedValue([{ id: "1" }])

    const result = await handlerFor(
      "GET",
      "/social-accounts",
    )?.({
      input: { workspaceId: "ws-1" },
    })

    expect(operations.list).toHaveBeenCalledWith("ws-1")
    expect(result).toEqual({ items: [{ id: "1" }] })
  })
})
