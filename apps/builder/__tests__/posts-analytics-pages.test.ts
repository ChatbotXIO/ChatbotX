// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  permissions: { current: {} as Record<string, boolean> },
  redirect: vi.fn((target: string) => {
    throw new Error(`redirect:${target}`)
  }),
  notFound: vi.fn(() => {
    throw new Error("not found")
  }),
}))

vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_BUILDER_URL: "http://localhost:3123",
    NEXT_PUBLIC_STORAGE_URL: undefined,
  },
}))
vi.mock("next-intl/plugin", () => ({
  default: () => (config: unknown) => config,
}))
vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  redirect: mocks.redirect,
}))
vi.mock("@/lib/auth/utils", () => ({
  getCurrentUserAndTargetWorkspace: async () => ({
    targetWorkspace: { id: "ws-1" },
    targetWorkspaceMember: { permissions: mocks.permissions.current },
  }),
}))
vi.mock("@/lib/workspace/require-not-scheduled-for-deletion", () => ({
  enforceWorkspaceNotScheduledForDeletionFromRequest: async () => undefined,
}))
vi.mock("@/features/contacts/permissions", () => ({
  buildContactPermissionScope: () => null,
}))
vi.mock("@/features/post-analytics/components/analytics-view", () => ({
  PostAnalyticsView: () => null,
}))

const { default: PostsAnalyticsPage } = await import(
  "../src/app/space/[workspaceId]/dashboard/posts/page"
)

const params = Promise.resolve({ workspaceId: "ws-1" })

beforeEach(() => {
  vi.clearAllMocks()
})

describe("/dashboard/posts permission", () => {
  test.each([
    ["analytics only", { analytics: true }, true],
    ["both", { analytics: true, broadcast: true }, true],
    ["broadcast only", { broadcast: true }, false],
    ["neither", {}, false],
  ])("%s -> allowed=%s", async (_name, permissions, allowed) => {
    mocks.permissions.current = permissions

    const result = PostsAnalyticsPage({ params })

    if (allowed) {
      await expect(result).resolves.toBeDefined()
    } else {
      await expect(result).rejects.toThrow("not found")
    }
  })
})

describe("/posts/analytics permission and filters", () => {
  const renderPage = async () => {
    const { default: PostAnalyticsPage } = await import(
      "../src/app/space/[workspaceId]/posts/analytics/page"
    )
    return PostAnalyticsPage({ params })
  }

  test.each([
    ["broadcast only", { broadcast: true }, true],
    ["both", { analytics: true, broadcast: true }, true],
    ["analytics only", { analytics: true }, false],
    ["neither", {}, false],
  ])("%s -> allowed=%s", async (_name, permissions, allowed) => {
    mocks.permissions.current = permissions

    const result = renderPage()

    if (allowed) {
      await expect(result).resolves.toBeDefined()
    } else {
      await expect(result).rejects.toThrow("not found")
    }
  })

  test("renders the view with its own channel and inbox filters", async () => {
    mocks.permissions.current = { broadcast: true }

    const element = (await renderPage()) as {
      props: { scopeFilters: string; workspaceId: string }
    }

    expect(element.props.scopeFilters).toBe("own")
    expect(element.props.workspaceId).toBe("ws-1")
  })
})

describe("/dashboard/posts filters", () => {
  test("renders the view with the shared row driving channel and inbox", async () => {
    mocks.permissions.current = { analytics: true }

    const element = (await PostsAnalyticsPage({ params })) as {
      props: { scopeFilters: string }
    }

    expect(element.props.scopeFilters).toBe("shared")
  })
})
