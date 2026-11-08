// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findNameAndEmail: vi.fn(),
  findMembership: vi.fn(),
  resolveAccess: vi.fn(),
}))

vi.mock("../src/user", () => ({
  userService: { findNameAndEmail: mocks.findNameAndEmail },
}))
vi.mock("../src/workspace-member", () => ({
  workspaceMemberService: { findMembership: mocks.findMembership },
}))
vi.mock("../src/workspace-support-access/resolve-access", () => ({
  resolveWorkspaceAccess: mocks.resolveAccess,
}))

const { resolveInstallerActor } = await import(
  "../src/template/installer-actor"
)

beforeEach(() => {
  vi.clearAllMocks()
})

describe("resolveInstallerActor", () => {
  test("an API-token installation acts with token power", async () => {
    await expect(
      resolveInstallerActor({
        installedBy: null,
        installedByKind: "apiToken",
        workspaceId: "ws-1",
      }),
    ).resolves.toEqual({ kind: "apiToken", permission: "full" })
  })

  test("a member whose user was deleted has lost access, never token power", async () => {
    await expect(
      resolveInstallerActor({
        installedBy: null,
        installedByKind: "member",
        workspaceId: "ws-1",
      }),
    ).resolves.toBeNull()
    expect(mocks.resolveAccess).not.toHaveBeenCalled()
  })

  test("a member who still has access acts with their permissions", async () => {
    mocks.findNameAndEmail.mockResolvedValue({ email: "a@b.c" })
    mocks.resolveAccess.mockResolvedValue({
      member: { permissions: { flows: "write" } },
    })
    await expect(
      resolveInstallerActor({
        installedBy: "user-1",
        installedByKind: "member",
        workspaceId: "ws-1",
      }),
    ).resolves.toEqual({ kind: "member", permissions: { flows: "write" } })
  })

  test("a member who lost the workspace has lost access", async () => {
    mocks.findNameAndEmail.mockResolvedValue({ email: "a@b.c" })
    mocks.resolveAccess.mockResolvedValue(undefined)
    await expect(
      resolveInstallerActor({
        installedBy: "user-1",
        installedByKind: "member",
        workspaceId: "ws-1",
      }),
    ).resolves.toBeNull()
  })
})
