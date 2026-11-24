// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"
import { GET } from "@/app/.well-known/openai-apps-challenge/route"

const env = vi.hoisted(() => ({
  OPENAI_APPS_DOMAIN_CHALLENGE: undefined as string | undefined,
}))

const tenant = vi.hoisted(() => ({ id: "1" }))

vi.mock("@/env", () => ({ env }))
vi.mock("@/lib/tenant/request-tenant", () => ({
  resolveRequestTenantId: async () => tenant.id,
}))
vi.mock("@chatbotx.io/database/schema", () => ({ ROOT_TENANT_ID: "1" }))

describe("OpenAI Apps domain challenge", () => {
  beforeEach(() => {
    env.OPENAI_APPS_DOMAIN_CHALLENGE = undefined
    tenant.id = "1"
  })

  test("returns 404 without a configured token", async () => {
    const response = await GET()

    expect(response.status).toBe(404)
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    await expect(response.text()).resolves.toBe("")
  })

  test("serves the exact configured token as uncached plain text", async () => {
    env.OPENAI_APPS_DOMAIN_CHALLENGE = "openai-portal-token"

    const response = await GET()

    expect(response.status).toBe(200)
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    expect(response.headers.get("Content-Type")).toBe(
      "text/plain; charset=utf-8",
    )
    await expect(response.text()).resolves.toBe("openai-portal-token")
  })

  test("returns 404 on a white-label domain even with a configured token", async () => {
    env.OPENAI_APPS_DOMAIN_CHALLENGE = "openai-portal-token"
    tenant.id = "reseller-tenant"

    const response = await GET()

    expect(response.status).toBe(404)
    await expect(response.text()).resolves.toBe("")
  })
})
