import type { WorkspaceApiTokenModel } from "@chatbotx.io/database/types"
import { describe, expect, test } from "vitest"
import { toWorkspaceApiTokenDto } from "../schema/workspace-token-dto"

describe("toWorkspaceApiTokenDto", () => {
  test("never includes tokenHash or encryptedToken in the client-facing key set", () => {
    const fullRow = {
      id: "token-1",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      workspaceId: "workspace-1",
      name: "My token",
      permission: "full",
      // server-only fields that must never reach the browser.
      tokenHash: "a".repeat(64),
      encryptedToken: { v: 1, iv: "iv", text: "enc(plaintext)", tag: "tag" },
      tokenPrefix: "cbx_ws_abcd",
      isDefault: false,
      scopes: null,
    } as unknown as WorkspaceApiTokenModel

    const dto = toWorkspaceApiTokenDto(fullRow)

    expect(dto).not.toHaveProperty("tokenHash")
    expect(dto).not.toHaveProperty("encryptedToken")
    expect(dto).not.toHaveProperty("workspaceId")
    expect(dto).not.toHaveProperty("updatedAt")
    expect(Object.keys(dto).sort()).toEqual([
      "createdAt",
      "id",
      "isDefault",
      "name",
      "permission",
      "scopes",
      "tokenPrefix",
    ])
  })
})
