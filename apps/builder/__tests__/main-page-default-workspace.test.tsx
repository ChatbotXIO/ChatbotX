import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getCurrentUserAndAllLinkedWorkspaces: vi.fn(),
  ensureFirstWorkspace: vi.fn(),
  resolveTenantByDomain: vi.fn(async () => "1"),
  loadHomeTemplateStore: vi.fn(),
  WorkspacesList: vi.fn(() => null),
  DeletedWorkspaces: vi.fn(() => null),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`)
  }),
}))

vi.mock("@chatbotx.io/auth/tenant", () => ({
  resolveTenantByDomain: mocks.resolveTenantByDomain,
}))
vi.mock("@chatbotx.io/business", () => ({
  isPlatformAdmin: vi.fn(async () => false),
  isSuperAdmin: vi.fn(async () => false),
  quotaEnforcementService: {},
  userQuotaService: {},
}))
vi.mock("@chatbotx.io/database/schema", () => ({ ROOT_TENANT_ID: "1" }))
vi.mock("next/navigation", () => ({
  notFound: vi.fn(),
  redirect: mocks.redirect,
}))
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string, values?: { name: string }) =>
    `${key}:${values?.name}`,
}))
vi.mock("@/components/expired-banner", () => ({ ExpiredBanner: () => null }))
vi.mock("@/components/workspace-deletion-pending-toast", () => ({
  WorkspaceDeletionPendingToast: () => null,
}))
vi.mock("@/env", () => ({ isCloud: () => false }))
vi.mock("@/features/workspaces/components/account-rail", () => ({
  AccountRail: () => null,
}))
vi.mock("@/features/workspaces/components/deleted-workspaces", () => ({
  DeletedWorkspaces: mocks.DeletedWorkspaces,
}))
vi.mock("@/features/workspaces/components/workspaces-list", () => ({
  default: mocks.WorkspacesList,
}))
vi.mock("@/features/workspaces/components/home-templates-panel", () => ({
  HomeTemplatesPanel: () => null,
}))
vi.mock("@/features/workspaces/lib/load-home-template-store", () => ({
  loadHomeTemplateStore: mocks.loadHomeTemplateStore,
}))
vi.mock("@/lib/auth/permission-routes", () => ({
  hasWorkspacePermission: () => false,
}))
vi.mock("@/lib/auth/require-password-current", () => ({
  enforcePasswordCurrent: vi.fn(),
}))
vi.mock("@/lib/auth/utils", () => ({
  getCurrentUserAndAllLinkedWorkspaces:
    mocks.getCurrentUserAndAllLinkedWorkspaces,
}))
vi.mock("@/lib/domain", () => ({ getDomainFromHeader: async () => "host" }))
vi.mock("@/lib/quota-metrics", () => ({
  buildQuotaMetrics: () => [],
  resolveBlockReason: () => null,
  resolveTrialEndsAt: () => null,
}))
vi.mock("@/lib/workspace/create-first-workspace", () => ({
  ensureFirstWorkspace: mocks.ensureFirstWorkspace,
}))

const { default: MainPage } = await import("../src/app/page")

const user = {
  id: "user-1",
  name: "Ann",
  email: "ann@example.com",
  image: null,
}

/** The page as Next renders it: `searchParams` arrives as a promise. */
function renderHome(query: Record<string, string> = {}) {
  return MainPage({ searchParams: Promise.resolve(query) })
}

type RenderedElement = {
  type: unknown
  props: Record<string, unknown> & { children?: unknown }
}

/** Every element of `type` in the tree a server component returned. */
function findElements(node: unknown, type: unknown): RenderedElement[] {
  if (Array.isArray(node)) {
    return node.flatMap((child) => findElements(child, type))
  }
  if (typeof node !== "object" || node === null || !("props" in node)) {
    return []
  }
  const element = node as RenderedElement
  const own = element.type === type ? [element] : []
  return [...own, ...findElements(element.props.children, type)]
}

function linked(members: unknown[]) {
  mocks.getCurrentUserAndAllLinkedWorkspaces.mockResolvedValue({
    user,
    allWorkspaces: [],
    allWorkspaceMembers: members,
  })
}

describe("MainPage default workspace", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.resolveTenantByDomain.mockResolvedValue("1")
    mocks.loadHomeTemplateStore.mockResolvedValue({
      status: "ready",
      hasTemplates: false,
      catalog: null,
    })
  })

  test("creates a named workspace and redirects into it when the user has no membership", async () => {
    linked([])
    mocks.ensureFirstWorkspace.mockResolvedValue({ id: "ws-new" })

    await expect(renderHome()).rejects.toThrow(
      "redirect:/space/ws-new/dashboard",
    )
    expect(mocks.ensureFirstWorkspace).toHaveBeenCalledWith("user-1", {
      name: "defaultName:Ann",
    })
  })

  test("names the workspace after the email when the user name is empty", async () => {
    mocks.getCurrentUserAndAllLinkedWorkspaces.mockResolvedValue({
      user: { ...user, name: "" },
      allWorkspaces: [],
      allWorkspaceMembers: [],
    })
    mocks.ensureFirstWorkspace.mockResolvedValue({ id: "ws-new" })

    await expect(renderHome()).rejects.toThrow(
      "redirect:/space/ws-new/dashboard",
    )
    expect(mocks.ensureFirstWorkspace).toHaveBeenCalledWith("user-1", {
      name: "defaultName:ann@example.com",
    })
  })

  test("falls back to the list instead of redirecting when the plan blocks creation", async () => {
    linked([])
    mocks.ensureFirstWorkspace.mockResolvedValue(null)

    await expect(renderHome()).resolves.toBeDefined()
    expect(mocks.redirect).not.toHaveBeenCalled()
  })

  test("does not create a workspace for an invited user who already has a membership", async () => {
    linked([
      {
        role: "agent",
        permissions: {},
        workspace: { id: "ws-invited" },
      },
    ])

    await expect(renderHome()).resolves.toBeDefined()
    expect(mocks.ensureFirstWorkspace).not.toHaveBeenCalled()
  })
})

const catalog = {
  tenantName: "Acme",
  categories: [],
  templates: [],
}

describe("MainPage templates tab", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.resolveTenantByDomain.mockResolvedValue("tenant-7")
    linked([{ role: "owner", permissions: {}, workspace: { id: "ws-1" } }])
  })

  const workspacesListProps = (tree: unknown) =>
    findElements(tree, mocks.WorkspacesList)[0]?.props

  /** The props the page hands to the Templates tab body. */
  const templatesPanelProps = (tree: unknown) =>
    (workspacesListProps(tree)?.templatesPanel as RenderedElement | undefined)
      ?.props

  test("the default tab only probes the store, with the tenant resolved once", async () => {
    mocks.loadHomeTemplateStore.mockResolvedValue({
      status: "ready",
      hasTemplates: true,
      catalog: null,
    })

    const tree = await renderHome()

    expect(mocks.resolveTenantByDomain).toHaveBeenCalledTimes(1)
    expect(mocks.loadHomeTemplateStore).toHaveBeenCalledTimes(1)
    const [{ tab, tenantId }] = mocks.loadHomeTemplateStore.mock.calls[0]
    expect(tab).toBe("workspaces")
    await expect(tenantId).resolves.toBe("tenant-7")
    expect(workspacesListProps(tree)).toMatchObject({
      activeTab: "workspaces",
      showTemplatesTab: true,
    })
    expect(findElements(tree, mocks.DeletedWorkspaces)).toHaveLength(1)
    expect(templatesPanelProps(tree)).toMatchObject({
      panel: "none",
      catalog: null,
    })
  })

  test("an empty store hides the Templates tab", async () => {
    mocks.loadHomeTemplateStore.mockResolvedValue({
      status: "ready",
      hasTemplates: false,
      catalog: null,
    })

    const tree = await renderHome()

    expect(workspacesListProps(tree)).toMatchObject({
      activeTab: "workspaces",
      showTemplatesTab: false,
    })
  })

  test("a store that could not be read hides the tab and the page still renders", async () => {
    mocks.loadHomeTemplateStore.mockResolvedValue({
      status: "failed",
      hasTemplates: false,
      catalog: null,
    })

    const tree = await renderHome()

    expect(workspacesListProps(tree)).toMatchObject({
      activeTab: "workspaces",
      showTemplatesTab: false,
    })
    expect(mocks.redirect).not.toHaveBeenCalled()
  })

  test("?tab=templates loads the catalog and shows it instead of the deleted workspaces", async () => {
    mocks.loadHomeTemplateStore.mockResolvedValue({
      status: "ready",
      hasTemplates: true,
      catalog,
    })

    const tree = await renderHome({ tab: "templates" })

    expect(mocks.loadHomeTemplateStore.mock.calls[0][0].tab).toBe("templates")
    expect(workspacesListProps(tree)).toMatchObject({
      activeTab: "templates",
      showTemplatesTab: true,
    })
    expect(findElements(tree, mocks.DeletedWorkspaces)).toHaveLength(0)
    expect(templatesPanelProps(tree)).toMatchObject({
      panel: "catalog",
      catalog,
    })
  })

  test("?tab=templates on an empty store goes back to the plain home URL", async () => {
    mocks.loadHomeTemplateStore.mockResolvedValue({
      status: "ready",
      hasTemplates: false,
      catalog,
    })

    await expect(renderHome({ tab: "templates" })).rejects.toThrow("redirect:/")
  })

  test("?tab=templates keeps the tab open when the store cannot be read", async () => {
    mocks.loadHomeTemplateStore.mockResolvedValue({
      status: "failed",
      hasTemplates: false,
      catalog: null,
    })

    const tree = await renderHome({ tab: "templates" })

    expect(mocks.redirect).not.toHaveBeenCalled()
    expect(workspacesListProps(tree)).toMatchObject({
      activeTab: "templates",
      showTemplatesTab: true,
    })
    // The tab is not left blank: the panel is told to say why.
    expect(templatesPanelProps(tree)).toMatchObject({
      panel: "failed",
      catalog: null,
    })
  })

  test("?tab=templates&key= opens that template inside the tab, ready to install", async () => {
    const openedTemplate = {
      template: { name: "Welcome flow" },
      shareToken: "tok-11",
      imageUrl: "/cover.png",
    }
    mocks.loadHomeTemplateStore.mockResolvedValue({
      status: "ready",
      hasTemplates: true,
      catalog: null,
      openedTemplate,
    })

    const tree = await renderHome({ tab: "templates", key: "tok-11" })

    expect(mocks.loadHomeTemplateStore.mock.calls[0][0]).toMatchObject({
      tab: "templates",
      templateKey: "tok-11",
    })
    expect(mocks.redirect).not.toHaveBeenCalled()
    expect(workspacesListProps(tree)).toMatchObject({
      activeTab: "templates",
      showTemplatesTab: true,
    })
    expect(templatesPanelProps(tree)).toMatchObject({
      panel: "template",
      openedTemplate,
      userId: "user-1",
    })
  })

  test("an unknown template key stays in the tab and says so, without a redirect", async () => {
    mocks.loadHomeTemplateStore.mockResolvedValue({
      status: "ready",
      hasTemplates: true,
      catalog: null,
      openedTemplate: null,
    })

    const tree = await renderHome({ tab: "templates", key: "gone" })

    expect(mocks.redirect).not.toHaveBeenCalled()
    expect(templatesPanelProps(tree)).toMatchObject({
      panel: "templateUnavailable",
    })
  })

  test.each<{ name: string; query: Record<string, string> }>([
    { name: "without a key", query: { tab: "templates" } },
    { name: "with an empty key", query: { tab: "templates", key: "" } },
  ])("$name the tab asks for the catalog and shows it", async ({ query }) => {
    mocks.loadHomeTemplateStore.mockResolvedValue({
      status: "ready",
      hasTemplates: true,
      catalog: { tenantName: "Acme", categories: [], templates: [] },
      openedTemplate: null,
    })

    const tree = await renderHome(query)

    expect(mocks.loadHomeTemplateStore.mock.calls[0][0].templateKey).toBe(null)
    expect(templatesPanelProps(tree)).toMatchObject({ panel: "catalog" })
  })

  test("an unknown tab behaves like the default one", async () => {
    await renderHome({ tab: "bogus" })

    expect(mocks.loadHomeTemplateStore.mock.calls[0][0].tab).toBe("workspaces")
  })
})
