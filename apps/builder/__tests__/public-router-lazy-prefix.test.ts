// @vitest-environment node

import { getLazyMeta, isProcedure, unlazy } from "@orpc/server"
import { describe, expect, test, vi } from "vitest"

vi.mock("@/middlewares/auth", () => ({
  authMiddleware: vi.fn(),
  workspaceAuthorizedMidddleware: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => {
  const proxy: unknown = new Proxy(() => proxy, { get: () => proxy })
  return { db: proxy, sql: proxy }
})

const PATH_PARAM_PATTERN = /\{[^}]+\}/g
const V1_PREFIX_PATTERN = /^\/v1\//

const { publicRouter } = await import("@/routers/public")

// Branches whose procedures span several unrelated `/v1/*` roots (e.g.
// `coupons` also serves `/v1/contacts/{id}/...`), so no single prefix fits.
// They load on the first public API request instead of on demand.
const UNPREFIXED_PUBLIC_BRANCHES = new Set([
  "coupons",
  "inboxes",
  "messengerTemplates",
  "pipelines",
  "sequences",
  "whatsappFlows",
  "whatsappTemplates",
  "workingHours",
])

function collectRoutePaths(node: unknown, paths: string[] = []): string[] {
  if (isProcedure(node)) {
    const path = (node as { "~orpc": { route: { path?: string } } })["~orpc"]
      .route.path
    if (path) {
      paths.push(path)
    }
    return paths
  }
  if (node && typeof node === "object") {
    for (const child of Object.values(node)) {
      collectRoutePaths(child, paths)
    }
  }
  return paths
}

describe("publicRouter lazy branches", () => {
  const branches = Object.entries(publicRouter)

  test("every branch is lazy", () => {
    for (const [key, branch] of branches) {
      expect(getLazyMeta(branch as never), key).toBeDefined()
    }
  })

  test("prefix is set unless the branch is explicitly unprefixed", () => {
    for (const [key, branch] of branches) {
      const prefix = getLazyMeta(branch as never)?.prefix
      if (UNPREFIXED_PUBLIC_BRANCHES.has(key)) {
        expect(prefix, key).toBeUndefined()
      } else {
        expect(prefix, key).toMatch(V1_PREFIX_PATTERN)
      }
    }
  })

  // A wrong prefix makes the branch unreachable (silent 404), so every
  // procedure must live under its branch's prefix.
  test.each(
    branches,
  )("%s: every route path starts with the branch prefix", async (key, branch) => {
    const prefix = getLazyMeta(branch as never)?.prefix
    const { default: router } = await unlazy(branch as never)
    const paths = collectRoutePaths(router)

    expect(paths.length, key).toBeGreaterThan(0)
    if (prefix) {
      for (const path of paths) {
        expect(path.startsWith(prefix), `${key}: ${path}`).toBe(true)
      }
    }
  })
})

// A prefix that is merely *consistent* with route paths can still hide a
// branch if the matcher never loads it — this drives the real handler with
// every operation in the committed spec and requires a match.
describe("publicRouter reachability through the OpenAPI handler", () => {
  test("every operation in the committed base spec is matched by the lazy router", async () => {
    const { createOpenAPIHandler } = await import("@/lib/orpc/handlers")
    const baseSpec = (await import("@/generated/public-spec.base.json")).default
    const handler = createOpenAPIHandler(publicRouter, {
      title: "Public API",
      logLabel: "lazy-prefix-test",
    })

    const unmatched: string[] = []
    for (const [path, item] of Object.entries(baseSpec.paths)) {
      for (const method of Object.keys(item)) {
        const url = `https://example.test/api${path.replace(PATH_PARAM_PATTERN, "x")}`
        const { matched } = await handler.handle(
          new Request(url, { method: method.toUpperCase() }),
          { prefix: "/api", context: { headers: new Headers(), url } },
        )
        if (!matched) {
          unmatched.push(`${method.toUpperCase()} ${path}`)
        }
      }
    }

    expect(unmatched).toEqual([])
  }, 120_000)
})
