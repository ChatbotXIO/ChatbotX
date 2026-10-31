// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  rowsByTable: new Map<string, Record<string, unknown>[]>(),
  calls: [] as { from: string; join?: string; where: unknown }[],
}))

vi.mock("@chatbotx.io/database/client", () => ({
  and: (...parts: unknown[]) => ({ and: parts }),
  db: {},
  eq: (field: unknown, value: unknown) => ({ eq: [field, value] }),
  inArray: (field: unknown, values: unknown[]) => ({ in: [field, values] }),
}))

const table = (name: string, columns: string[]) =>
  Object.fromEntries([
    ["__name", name],
    ...columns.map((column) => [column, `${name}.${column}`]),
  ])

vi.mock("@chatbotx.io/database/schema", () => ({
  decisionProfileModel: table("decisionProfile", ["id", "workspaceId"]),
  folderModel: table("folder", ["id", "workspaceId"]),
  pipelineModel: table("pipeline", ["id", "workspaceId"]),
  productCategoryModel: table("productCategory", ["id", "workspaceId"]),
  tagModel: table("tag", ["id", "workspaceId"]),
  inboxModel: table("inbox", ["id", "workspaceId"]),
  integrationMessengerModel: table("integrationMessenger", [
    "id",
    "workspaceId",
    "personas",
  ]),
  integrationModel: table("integration", ["id", "workspaceId"]),
  integrationOpenaiCompatibleModel: table("openaiCompatible", [
    "id",
    "workspaceId",
  ]),
  integrationSmtpModel: table("smtp", ["id", "workspaceId"]),
  integrationWhatsappModel: table("integrationWhatsapp", ["id", "workspaceId"]),
  leaderboardModel: table("leaderboard", ["id", "workspaceId"]),
  placeCategoryModel: table("placeCategory", ["id", "workspaceId"]),
  messengerMessageTemplateModel: table("messengerTemplate", [
    "id",
    "integrationMessengerId",
  ]),
  miniAppModel: table("miniApp", ["id", "workspaceId"]),
  productModel: table("product", ["id", "workspaceId"]),
  sequenceModel: table("sequence", ["id", "workspaceId"]),
  spreadsheetModel: table("spreadsheet", ["id", "workspaceId"]),
  userPersistentMenuModel: table("menu", ["id", "workspaceId"]),
  vendorModel: table("vendor", ["id", "workspaceId"]),
  webhookModel: table("webhook", ["id", "workspaceId"]),
  whatsappFlowModel: table("whatsappFlow", ["id", "integrationWhatsappId"]),
  whatsappMessageTemplateModel: table("whatsappTemplate", [
    "id",
    "integrationWhatsappId",
  ]),
}))

const { referenceExistenceRepository } = await import(
  "../src/repositories/reference-existence/repository"
)

const fakeTx = {
  select: () => ({
    from: (source: { __name: string }) => {
      const record = (join: string | undefined, where: unknown) => {
        mocks.calls.push({ from: source.__name, join, where })
        return Promise.resolve(mocks.rowsByTable.get(source.__name) ?? [])
      }
      return {
        where: (where: unknown) => record(undefined, where),
        innerJoin: (joined: { __name: string }) => ({
          where: (where: unknown) => record(joined.__name, where),
        }),
      }
    },
  }),
}

const find = (kind: string, ids: string[]) =>
  referenceExistenceRepository.findExistingIds(
    { workspaceId: "ws-1", kind: kind as never, ids },
    fakeTx as never,
  )

beforeEach(() => {
  mocks.rowsByTable.clear()
  mocks.calls.length = 0
})

describe("referenceExistenceRepository.findExistingIds", () => {
  test("a direct kind is scoped by its own workspaceId", async () => {
    mocks.rowsByTable.set("product", [{ id: "1" }])

    const found = await find("product", ["1", "2"])

    expect([...found]).toEqual(["1"])
    expect(JSON.stringify(mocks.calls[0].where)).toContain(
      "product.workspaceId",
    )
  })

  test.each([
    "tag",
    "pipeline",
    "folder",
    "productCategory",
  ])("%s (a natural-key kind a single-flow import verifies) is workspace-scoped", async (kind) => {
    mocks.rowsByTable.set(kind, [{ id: "1" }])

    const found = await find(kind, ["1", "2"])

    expect([...found]).toEqual(["1"])
    expect(JSON.stringify(mocks.calls[0].where)).toContain(
      `${kind}.workspaceId`,
    )
  })

  test.each([
    ["messengerTemplate", "messengerTemplate", "integrationMessenger"],
    ["whatsappTemplate", "whatsappTemplate", "integrationWhatsapp"],
    ["whatsappFlow", "whatsappFlow", "integrationWhatsapp"],
  ])("%s is scoped through its integration's workspace", async (kind, from, join) => {
    mocks.rowsByTable.set(from, [{ id: "9" }])

    const found = await find(kind, ["9", "10"])

    expect([...found]).toEqual(["9"])
    expect(mocks.calls[0]).toMatchObject({ from, join })
    expect(JSON.stringify(mocks.calls[0].where)).toContain(
      `${join}.workspaceId`,
    )
    expect(JSON.stringify(mocks.calls[0].where)).toContain('"ws-1"')
  })

  test("a persona exists only in a messenger integration of the workspace", async () => {
    mocks.rowsByTable.set("integrationMessenger", [
      { personas: [{ id: "p1" }, { id: "p2" }] },
      { personas: [] },
    ])

    const found = await find("messengerPersona", ["p2", "other"])

    expect([...found]).toEqual(["p2"])
    expect(JSON.stringify(mocks.calls[0].where)).toContain(
      "integrationMessenger.workspaceId",
    )
  })

  test("an integration id may name a row of any of the integration tables", async () => {
    mocks.rowsByTable.set("smtp", [{ id: "s1" }])
    mocks.rowsByTable.set("integrationMessenger", [{ id: "m1" }])

    const found = await find("integration", ["s1", "m1", "foreign"])

    expect([...found].sort()).toEqual(["m1", "s1"])
    expect(mocks.calls.map((call) => call.from).sort()).toEqual([
      "integration",
      "integrationMessenger",
      "openaiCompatible",
      "smtp",
    ])
    for (const call of mocks.calls) {
      expect(JSON.stringify(call.where)).toContain(".workspaceId")
    }
  })

  test("an empty id list costs no query", async () => {
    expect((await find("whatsappFlow", [])).size).toBe(0)
    expect(mocks.calls).toHaveLength(0)
  })
})
