// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  updates: [] as { set: Record<string, unknown> }[],
  createFunction: vi.fn(),
  createWebchat: vi.fn(),
  createBulk: vi.fn(),
  createProduct: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({ db: {}, eq: vi.fn() }))
vi.mock("@chatbotx.io/database/schema", () => ({
  aiFunctionModel: {},
  integrationWebchatModel: {},
}))
vi.mock("../src/ai-function/service", () => ({
  aiFunctionService: { create: mocks.createFunction },
}))
vi.mock("../src/integration-webchat/service", () => ({
  integrationWebchatService: { create: mocks.createWebchat },
}))
vi.mock("../src/product/service", () => ({
  productService: { create: mocks.createProduct },
  productAddonService: { createBulk: mocks.createBulk },
}))

const { aiFunctionsAdapter } = await import(
  "../src/template/adapters/ai-functions"
)
const { webchatsAdapter } = await import("../src/template/adapters/webchats")
const { productsAdapter } = await import("../src/template/adapters/products")

const buildCtx = (overrides: Record<string, unknown> = {}) => {
  const tx = {
    update: () => ({
      set: (set: Record<string, unknown>) => {
        mocks.updates.push({ set })
        return { where: () => Promise.resolve() }
      },
    }),
    query: { workspaceModel: { findFirst: vi.fn() } },
  }
  return {
    tx,
    workspaceId: "ws-1",
    installationId: "inst-1",
    idMaps: {} as Record<string, Map<string, string>>,
    track: vi.fn(),
    warn: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.updates.length = 0
})

describe("ai functions: deferred trigger flow", () => {
  const entry = {
    sourceId: "src-fn",
    name: "Lookup",
    dataCollect: [],
    triggerFlowId: "src-flow",
  }

  test("is written once flows exist", async () => {
    mocks.createFunction.mockResolvedValue([{ id: "fn-new" }])
    const ctx = buildCtx()
    const patches = await aiFunctionsAdapter.insert(ctx as never, [entry])

    ctx.idMaps.flow = new Map([["src-flow", "tgt-flow"]])
    await patches[0].apply(ctx as never)

    expect(mocks.updates).toEqual([{ set: { triggerFlowId: "tgt-flow" } }])
  })

  test("warns under the SOURCE function id when the flow did not come along", async () => {
    mocks.createFunction.mockResolvedValue([{ id: "fn-new" }])
    const ctx = buildCtx()
    const patches = await aiFunctionsAdapter.insert(ctx as never, [entry])

    await patches[0].apply(ctx as never)

    expect(mocks.updates).toEqual([])
    expect(ctx.warn).toHaveBeenCalledWith({
      category: "aiFunctions",
      entityKind: "flow",
      path: "aiFunctions.src-fn.triggerFlowId",
      value: "src-flow",
    })
  })

  test("a function without a trigger flow needs no patch task", async () => {
    mocks.createFunction.mockResolvedValue([{ id: "fn-new" }])
    const patches = await aiFunctionsAdapter.insert(buildCtx() as never, [
      { ...entry, triggerFlowId: null },
    ])

    expect(patches).toEqual([])
  })
})

describe("webchats", () => {
  const entry = {
    sourceId: "src-wc",
    name: "Site chat",
    enable: true,
    authorizedDomains: [],
    conversationStarters: [],
    persistentMenus: [],
    brandColor: "#000",
    hideHeader: false,
    showLogo: true,
    hideMessageInput: false,
    customCss: null,
    welcomeFlowId: "src-flow",
  }

  test("warns for every entry instead of dropping them silently when the workspace row is missing", async () => {
    const ctx = buildCtx()
    ctx.tx.query.workspaceModel.findFirst.mockResolvedValue(undefined)

    const patches = await webchatsAdapter.insert(ctx as never, [
      entry,
      { ...entry, sourceId: "src-wc-2" },
    ])

    expect(patches).toEqual([])
    expect(mocks.createWebchat).not.toHaveBeenCalled()
    expect(ctx.warn.mock.calls.map(([warning]) => warning.path)).toEqual([
      "webchats.src-wc",
      "webchats.src-wc-2",
    ])
    expect(ctx.warn.mock.calls[0][0]).toMatchObject({
      category: "webchats",
      entityKind: "workspaceUnavailable",
    })
    expect(ctx.track).not.toHaveBeenCalled()
  })

  test("warns under the SOURCE webchat id when the welcome flow did not come along", async () => {
    const ctx = buildCtx()
    ctx.tx.query.workspaceModel.findFirst.mockResolvedValue({ ownerId: "o1" })
    mocks.createWebchat.mockResolvedValue({ integration: { id: "wc-new" } })
    const patches = await webchatsAdapter.insert(ctx as never, [entry])

    await patches[0].apply(ctx as never)

    expect(ctx.warn).toHaveBeenCalledWith({
      category: "webchats",
      entityKind: "flow",
      path: "webchats.src-wc.welcomeFlowId",
      value: "src-flow",
    })
  })
})

describe("products: add-on patching", () => {
  const product = (addons: unknown[]) =>
    ({
      sourceId: "src-p",
      name: "Pizza",
      categoryId: null,
      subcategoryId: null,
      addons,
    }) as never

  test("creates the add-ons whose products came along", async () => {
    mocks.createProduct.mockResolvedValue({ id: "p-new" })
    const ctx = buildCtx()
    const patches = await productsAdapter.insert(ctx as never, [
      product([
        { name: "Extras", maxSelections: 1, addonProductIds: ["src-x"] },
      ]),
    ])

    ctx.idMaps.product = new Map([["src-x", "tgt-x"]])
    await patches[0].apply(ctx as never)

    expect(mocks.createBulk).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: "p-new",
        addons: [
          { name: "Extras", maxSelections: 1, addonProductIds: ["tgt-x"] },
        ],
      }),
    )
  })

  test("skips the bulk create and warns under the source product id when none resolved", async () => {
    mocks.createProduct.mockResolvedValue({ id: "p-new" })
    const ctx = buildCtx()
    const patches = await productsAdapter.insert(ctx as never, [
      product([
        { name: "Extras", maxSelections: 1, addonProductIds: ["src-x"] },
      ]),
    ])

    await patches[0].apply(ctx as never)

    expect(mocks.createBulk).not.toHaveBeenCalled()
    expect(ctx.warn).toHaveBeenCalledWith({
      category: "products",
      entityKind: "product",
      path: "products.src-p.addons.addonProductIds",
      value: "src-x",
    })
  })

  test("a product without add-ons needs no patch task", async () => {
    mocks.createProduct.mockResolvedValue({ id: "p-new" })

    const patches = await productsAdapter.insert(buildCtx() as never, [
      product([]),
    ])

    expect(patches).toEqual([])
  })
})
