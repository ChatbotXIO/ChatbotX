// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"
import { GET } from "@/app/.well-known/openai-apps-challenge/route"

const env = vi.hoisted(() => ({
  OPENAI_APPS_DOMAIN_CHALLENGE: undefined as string | undefined,
}))

vi.mock("@/env", () => ({ env }))

describe("OpenAI Apps domain challenge", () => {
  beforeEach(() => {
    env.OPENAI_APPS_DOMAIN_CHALLENGE = undefined
  })

  test("returns 404 without a configured token", async () => {
    const response = GET()

    expect(response.status).toBe(404)
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    await expect(response.text()).resolves.toBe("")
  })

  test("serves the exact configured token as uncached plain text", async () => {
    env.OPENAI_APPS_DOMAIN_CHALLENGE = "openai-portal-token"

    const response = GET()

    expect(response.status).toBe(200)
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    expect(response.headers.get("Content-Type")).toBe(
      "text/plain; charset=utf-8",
    )
    await expect(response.text()).resolves.toBe("openai-portal-token")
  })
})
