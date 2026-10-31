// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  insertValues: vi.fn(),
  claim: vi.fn(),
  complete: vi.fn(),
  release: vi.fn(),
  fail: vi.fn(),
  deleteObject: vi.fn(),
  settingsInsert: vi.fn(),
  warn: vi.fn(),
}))

vi.mock("../src/template/sync-hash", () => ({
  stampSyncedHashes: vi.fn(),
}))
vi.mock("../src/coupon/service", () => ({
  couponService: { invalidate: vi.fn() },
}))
vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    transaction: (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        execute: vi.fn(),
        insert: () => ({ values: mocks.insertValues }),
      }),
  },
  sql: { raw: (text: string) => text },
}))

vi.mock("@chatbotx.io/database/statement-timeout", () => ({
  setLocalStatementTimeout: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  templateInstallationRepository: {
    claim: mocks.claim,
    complete: mocks.complete,
    release: mocks.release,
    fail: mocks.fail,
    findPendingPublishEffects: vi.fn().mockResolvedValue([]),
    clearPendingPublishEffects: vi.fn(),
  },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  templateInstalledResourceModel: {},
}))

vi.mock("@chatbotx.io/events", () => ({ updateTriggerCache: vi.fn() }))

vi.mock("@chatbotx.io/filesystem", () => ({
  uploader: { deleteObject: mocks.deleteObject },
}))

vi.mock("../src/logger", () => ({
  logger: { warn: mocks.warn, error: vi.fn(), info: vi.fn() },
}))

vi.mock("../src/ai-agent/service", () => ({
  aiAgentService: { invalidate: vi.fn() },
}))
vi.mock("../src/automated-response/service", () => ({
  automatedResponseService: { invalidateCache: vi.fn() },
}))
vi.mock("../src/bot-field/service", () => ({
  botFieldService: { invalidate: vi.fn() },
}))
vi.mock("../src/custom-field/service", () => ({
  customFieldService: { invalidate: vi.fn() },
}))
vi.mock("../src/flow-version", () => ({
  flowVersionService: { afterPublish: vi.fn() },
}))
vi.mock("../src/template/adapters/manifests/resolve", () => ({
  resolveManifests: vi.fn().mockResolvedValue({
    installFolderId: null,
    denied: new Set(),
  }),
}))
vi.mock("../src/pipeline/service", () => ({
  pipelineService: { invalidateList: vi.fn() },
}))
vi.mock("../src/template/adapters/registry", () => ({
  TEMPLATE_INSTALL_ORDER: ["settings"],
  getTemplateAdapter: (category: string) =>
    category === "settings" ? { insert: mocks.settingsInsert } : undefined,
}))

const { templateInstallService } = await import(
  "../src/template/install.service"
)

const payloadWith = (permissions?: Record<string, unknown>) => ({
  source: { workspaceId: "11", tenantId: "1" },
  ...(permissions ? { permissions } : {}),
  manifests: {
    folders: [],
    customFields: [],
    tags: [],
    productCategories: [],
  },
  resources: {
    settings: {
      savedReplies: [
        { sourceId: "reply-1", kind: "savedReply" },
        { sourceId: "reply-2", kind: "savedReply" },
      ],
      botFields: [],
    },
  },
})

const track = (
  ctx: {
    track: (entry: unknown) => void
  },
  entries: { sourceId: string; wasExisting?: boolean }[],
) => {
  for (const entry of entries) {
    ctx.track({
      category: "settings",
      resourceKind: "savedReply",
      resourceId: `target-${entry.sourceId}`,
      sourceResourceId: entry.sourceId,
      wasExisting: entry.wasExisting ?? false,
    })
  }
}

const installWith = async (input: {
  permissions: { allowEdit: boolean; allowDelete: boolean }
  payloadPermissions?: Record<string, unknown>
  tracked: { sourceId: string; wasExisting?: boolean }[]
}) => {
  mocks.settingsInsert.mockImplementation((ctx) => {
    track(ctx, input.tracked)
    return []
  })
  await templateInstallService.run({
    installationId: "install-1",
    workspaceId: "ws-1",
    claimToken: "token-1",
    permissions: input.permissions,
    payload: payloadWith(input.payloadPermissions) as never,
    templateName: "Shop",
    createInstallFolder: false,
  })
  const rows = mocks.insertValues.mock.calls.flatMap(
    (call) => call[0] as Record<string, unknown>[],
  )
  return Object.fromEntries(
    rows.map((row) => [row.sourceResourceId as string, row]),
  )
}

describe("template install: copied lock flags", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.complete.mockResolvedValue(true)
    mocks.insertValues.mockResolvedValue(undefined)
  })

  test("an item with no lock inherits the install-wide permissions", async () => {
    const rows = await installWith({
      permissions: { allowEdit: true, allowDelete: false },
      tracked: [{ sourceId: "reply-1" }],
    })

    expect(rows["reply-1"]).toMatchObject({
      allowEdit: true,
      allowDelete: false,
    })
  })

  test("a View-only item is locked while a sibling stays editable", async () => {
    const rows = await installWith({
      permissions: { allowEdit: true, allowDelete: true },
      payloadPermissions: { settings: { "reply-1": { allowEdit: false } } },
      tracked: [{ sourceId: "reply-1" }, { sourceId: "reply-2" }],
    })

    expect(rows["reply-1"]).toMatchObject({ allowEdit: false })
    expect(rows["reply-2"]).toMatchObject({ allowEdit: true })
  })

  test("the template's install-wide allowEdit=false locks every item", async () => {
    const rows = await installWith({
      permissions: { allowEdit: false, allowDelete: true },
      tracked: [{ sourceId: "reply-1" }, { sourceId: "reply-2" }],
    })

    expect(rows["reply-1"]).toMatchObject({ allowEdit: false })
    expect(rows["reply-2"]).toMatchObject({ allowEdit: false })
  })

  test("a reused row (wasExisting) is never locked", async () => {
    const rows = await installWith({
      permissions: { allowEdit: false, allowDelete: false },
      payloadPermissions: { settings: { "reply-1": { allowEdit: false } } },
      tracked: [{ sourceId: "reply-1", wasExisting: true }],
    })

    expect(rows["reply-1"]).toMatchObject({
      allowEdit: true,
      allowDelete: true,
    })
  })
})
