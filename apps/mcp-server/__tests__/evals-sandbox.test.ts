import { afterEach, describe, expect, test } from "vitest"
import { createSandbox } from "../evals/sandbox"

const sandboxSpec = {
  paths: {
    "/v1/tags": {
      post: {
        operationId: "tags.create",
        summary: "Create tag",
      },
    },
  },
} as Parameters<typeof createSandbox>[0]

describe("evaluation sandbox", () => {
  let closeSandbox: (() => Promise<void>) | undefined

  afterEach(async () => {
    await closeSandbox?.()
    closeSandbox = undefined
  })

  test("rejects a non-object JSON body as malformed", async () => {
    const sandbox = await createSandbox(sandboxSpec)
    closeSandbox = sandbox.close

    const response = await fetch(`${sandbox.baseUrl}/v1/tags`, {
      body: "null",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: "malformedJson" })
    expect(sandbox.traces).toEqual([
      expect.objectContaining({ body: undefined, status: 400 }),
    ])
  })
})
