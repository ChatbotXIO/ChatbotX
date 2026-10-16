import { decisionRepository } from "@chatbotx.io/database/repositories"
import type { DecisionConnectionModel } from "@chatbotx.io/database/types"
import { type EncryptedData, encryptUtils } from "@chatbotx.io/encryption"
import { afterEach, describe, expect, test, vi } from "vitest"
import { decisionConnectionService } from "./connection-service"

const encryptedCredential = {
  iv: "0".repeat(24),
  tag: "0".repeat(32),
  text: "encrypted",
  v: 1,
} satisfies EncryptedData

const connection = {
  createdAt: new Date(),
  credential: encryptedCredential,
  defaultModel: "model-a",
  endpoint: null,
  id: "10",
  lastTestStatus: null,
  lastTestedAt: null,
  modelCatalog: ["model-a"],
  name: "Decision",
  providerKind: "typesafe",
  status: "enabled",
  updatedAt: new Date(),
  workspaceId: "1",
} satisfies DecisionConnectionModel

afterEach(() => vi.restoreAllMocks())

describe("DecisionConnectionService", () => {
  test("normalizes a catalog and encrypts credentials before persisting", async () => {
    vi.spyOn(encryptUtils, "encryptObject").mockResolvedValue(
      encryptedCredential,
    )
    const create = vi
      .spyOn(decisionRepository, "createConnection")
      .mockResolvedValue(connection)

    await expect(
      decisionConnectionService.create({
        credential: "secret",
        defaultModel: "model-a",
        modelCatalog: [" model-a ", "model-a", "model-b"],
        name: " Decision ",
        providerKind: "typesafe",
        workspaceId: "1",
      }),
    ).resolves.toMatchObject({ modelCatalog: ["model-a"] })

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        credential: encryptedCredential,
        modelCatalog: ["model-a", "model-b"],
        name: "Decision",
      }),
    )
  })

  test("keeps the encrypted credential when an edit omits it", async () => {
    vi.spyOn(
      decisionRepository,
      "findConnectionByIdForWorkspace",
    ).mockResolvedValue(connection)
    const update = vi
      .spyOn(decisionRepository, "updateConnectionForWorkspace")
      .mockResolvedValue(connection)

    await decisionConnectionService.update({
      defaultModel: "model-a",
      id: "10",
      modelCatalog: ["model-a"],
      name: "Decision",
      providerKind: "typesafe",
      workspaceId: "1",
    })

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ credential: undefined, id: "10" }),
    )
  })

  test("rejects a default model outside the normalized catalog", async () => {
    await expect(
      decisionConnectionService.create({
        credential: "secret",
        defaultModel: "missing",
        modelCatalog: ["model-a"],
        name: "Decision",
        providerKind: "typesafe",
        workspaceId: "1",
      }),
    ).rejects.toMatchObject({ code: "invalidDecisionModel" })
  })

  test("requires an endpoint only for compatible providers", async () => {
    await expect(
      decisionConnectionService.create({
        credential: "secret",
        modelCatalog: ["model-a"],
        name: "Decision",
        providerKind: "systemOneCompatible",
        workspaceId: "1",
      }),
    ).rejects.toMatchObject({ code: "invalidDecisionEndpoint" })
  })
})
