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

const nestedContactSpec = {
  paths: {
    "/v1/contacts/{identifier}/messages": {
      post: {
        operationId: "contacts.sendMessage",
        summary: "Send message",
      },
    },
  },
} as Parameters<typeof createSandbox>[0]

const nestedResourceSpec = {
  paths: {
    "/v1/appointments/{id}/cancel": {
      post: {
        operationId: "appointments.cancel",
        summary: "Cancel appointment",
      },
    },
    "/v1/contacts/{identifier}/sequences": {
      post: {
        operationId: "contacts.subscribeSequences",
        summary: "Subscribe sequences",
      },
    },
    "/v1/contacts/{identifier}/tags/by-name": {
      post: {
        operationId: "contacts.addTagsByName",
        summary: "Add tags by name",
      },
    },
    "/v1/contacts/{identifier}/tags": {
      post: {
        operationId: "contacts.addTags",
        summary: "Add tags",
      },
    },
  },
} as Parameters<typeof createSandbox>[0]
const queryCoercionSpec = {
  paths: {
    "/v1/contacts": {
      get: {
        operationId: "contacts.list",
        parameters: [
          {
            in: "query",
            name: "perPage",
            schema: { type: "integer" },
          },
          {
            in: "query",
            name: "includeInactive",
            schema: { type: "boolean" },
          },
        ],
        summary: "List contacts",
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

  test("serves its ephemeral URL in the OpenAPI spec", async () => {
    const sandbox = await createSandbox(sandboxSpec)
    closeSandbox = sandbox.close

    const response = await fetch(`${sandbox.baseUrl}/public-spec.json`)

    await expect(response.json()).resolves.toMatchObject({
      servers: [{ url: sandbox.baseUrl }],
    })
  })

  test("uses the contact segment for a nested message route", async () => {
    const sandbox = await createSandbox(nestedContactSpec)
    closeSandbox = sandbox.close

    const response = await fetch(
      `${sandbox.baseUrl}/v1/contacts/email%3Aada%40example.com/messages`,
      {
        body: JSON.stringify({ text: "hello" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
    )

    expect(response.status).toBe(200)
  })

  test("coerces scalar query parameters before schema validation", async () => {
    const sandbox = await createSandbox(queryCoercionSpec)
    closeSandbox = sandbox.close

    const response = await fetch(
      `${sandbox.baseUrl}/v1/contacts?perPage=5&includeInactive=true`,
    )

    expect(response.status).toBe(200)
  })

  test("uses path identifiers for nested contact and appointment actions", async () => {
    const sandbox = await createSandbox(nestedResourceSpec)
    closeSandbox = sandbox.close
    const options = {
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }

    const [appointment, sequence, tags, tagIds] = await Promise.all([
      fetch(`${sandbox.baseUrl}/v1/appointments/99/cancel`, {
        ...options,
        body: "{}",
      }),
      fetch(`${sandbox.baseUrl}/v1/contacts/id%3A12/sequences`, {
        ...options,
        body: JSON.stringify({ sequenceIds: ["7"] }),
      }),
      fetch(`${sandbox.baseUrl}/v1/contacts/id%3A12/tags/by-name`, {
        ...options,
        body: JSON.stringify({ tags: ["VIP"] }),
      }),
      fetch(`${sandbox.baseUrl}/v1/contacts/id%3A12/tags`, {
        ...options,
        body: JSON.stringify({ tagIds: ["1"] }),
      }),
    ])

    expect([
      appointment.status,
      sequence.status,
      tags.status,
      tagIds.status,
    ]).toEqual([200, 200, 200, 200])
  })
})
