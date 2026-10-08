import { afterEach, describe, expect, test } from "vitest"
import { createSandbox } from "../evals/sandbox"

const jsonResponse = (status: "200" | "201") => ({
  responses: {
    [status]: { content: { "application/json": { schema: {} } } },
  },
})

const appointmentResponse = {
  responses: {
    "201": {
      content: {
        "application/json": {
          schema: {
            required: [
              "id",
              "calendarId",
              "contactId",
              "conversationId",
              "startAt",
              "endAt",
              "inviteeTimezone",
              "status",
              "locationType",
              "locationDetail",
              "externalEventId",
              "cancelledAt",
              "createdAt",
              "updatedAt",
            ],
            type: "object",
          },
        },
      },
    },
  },
}

const tagsBody = {
  content: {
    "application/json": {
      schema: {
        properties: { tagIds: { items: { type: "string" }, type: "array" } },
        required: ["tagIds"],
        type: "object",
      },
    },
  },
}

const sandboxSpec = {
  paths: {
    "/v1/appointment-calendars/{id}/availability": {
      get: {
        ...jsonResponse("200"),
        operationId: "appointmentCalendars.getAvailability",
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "string" },
          },
          {
            in: "query",
            name: "startDate",
            required: true,
            schema: { type: "string" },
          },
          {
            in: "query",
            name: "endDate",
            required: true,
            schema: { type: "string" },
          },
        ],
      },
    },
    "/v1/appointments": {
      post: {
        ...appointmentResponse,
        operationId: "appointments.book",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                properties: {
                  calendarId: { type: "string" },
                  contactId: { type: "string" },
                  startAt: { type: "string" },
                },
                required: ["calendarId", "contactId", "startAt"],
                type: "object",
              },
            },
          },
        },
      },
    },
    "/v1/connection-providers": {
      get: {
        ...jsonResponse("200"),
        operationId: "connectionProviders.list",
      },
    },
    "/v1/connections": {
      get: {
        ...jsonResponse("200"),
        operationId: "connections.list",
      },
      post: {
        ...jsonResponse("201"),
        operationId: "connections.create",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                properties: {
                  config: { type: "object" },
                  provider: { type: "string" },
                },
                required: ["provider"],
                type: "object",
              },
            },
          },
        },
      },
    },
    "/v1/connect-sessions/{id}": {
      get: {
        ...jsonResponse("200"),
        operationId: "connectSessions.get",
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "string" },
          },
        ],
      },
    },
    "/v1/connect-sessions/{id}/targets": {
      post: {
        ...jsonResponse("200"),
        operationId: "connectSessions.connectTargets",
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                properties: {
                  targetIds: {
                    items: { type: "string" },
                    minItems: 1,
                    type: "array",
                  },
                },
                required: ["targetIds"],
                type: "object",
              },
            },
          },
        },
      },
    },
    "/v1/contacts": {
      get: {
        ...jsonResponse("200"),
        operationId: "contacts.list",
        parameters: [
          { in: "query", name: "perPage", schema: { type: "integer" } },
          { in: "query", name: "keyword", schema: { type: "string" } },
        ],
      },
    },
    "/v1/contacts/{identifier}/messages": {
      post: {
        operationId: "contacts.sendMessage",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                properties: { text: { type: "string" } },
                required: ["text"],
                type: "object",
              },
            },
          },
        },
        responses: { "204": {} },
      },
    },
    "/v1/contacts/{identifier}/tags": {
      post: {
        operationId: "contacts.addTags",
        requestBody: tagsBody,
        responses: { "204": {} },
      },
    },
    "/v1/contacts/{identifier}/tags/set": {
      put: {
        operationId: "contacts.setTags",
        requestBody: tagsBody,
        responses: { "204": {} },
      },
    },
    "/v1/conversations/{conversationId}/messages": {
      post: {
        ...jsonResponse("201"),
        operationId: "messages.create",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                properties: { text: { type: "string" } },
                required: ["text"],
                type: "object",
              },
            },
          },
        },
      },
    },
    "/v1/sequences": {
      get: {
        operationId: "sequences.list",
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  properties: {
                    data: {
                      items: {
                        required: [
                          "id",
                          "createdAt",
                          "updatedAt",
                          "name",
                          "folderId",
                          "active",
                          "subscribers",
                          "messages",
                          "workspaceId",
                          "stepsCount",
                          "subscribersCount",
                        ],
                        type: "object",
                      },
                      type: "array",
                    },
                    pageCount: { type: "number" },
                  },
                  required: ["data", "pageCount"],
                  type: "object",
                },
              },
            },
          },
        },
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

  test("records coerced arguments and contract response metadata", async () => {
    const sandbox = await createSandbox(sandboxSpec)
    closeSandbox = sandbox.close

    const response = await fetch(
      `${sandbox.baseUrl}/v1/contacts?keyword=An&perPage=1`,
    )

    expect(response.status).toBe(200)
    expect(sandbox.traces).toEqual([
      expect.objectContaining({
        arguments: { keyword: "An", perPage: 1 },
        readOnly: true,
        responseBody: expect.any(Object),
        status: 200,
      }),
    ])
  })

  test("paginates identical names without treating the first page as unique", async () => {
    const sandbox = await createSandbox(sandboxSpec)
    closeSandbox = sandbox.close

    const response = await fetch(
      `${sandbox.baseUrl}/v1/contacts?keyword=An&perPage=1&page=2`,
    )

    await expect(response.json()).resolves.toMatchObject({
      data: [{ email: "another.an@example.com", id: "13" }],
      pageCount: 2,
      totalCount: 2,
    })
  })

  test("returns sequence fields required by the public contract", async () => {
    const sandbox = await createSandbox(sandboxSpec)
    closeSandbox = sandbox.close

    const response = await fetch(`${sandbox.baseUrl}/v1/sequences`)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      data: [
        {
          id: "7",
          name: "Nurture",
          stepsCount: 0,
          subscribersCount: 0,
        },
      ],
      pageCount: 1,
    })
  })

  test("records only an applied tag mutation and sends no body for 204", async () => {
    const sandbox = await createSandbox(sandboxSpec)
    closeSandbox = sandbox.close

    const response = await fetch(
      `${sandbox.baseUrl}/v1/contacts/id%3A11/tags`,
      {
        body: JSON.stringify({ tagIds: ["1"] }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
    )

    expect(response.status).toBe(204)
    expect(await response.text()).toBe("")
    expect(sandbox.snapshot().journal).toEqual([
      expect.objectContaining({
        operation: "contacts.addTags",
        targetId: "11",
      }),
    ])
  })

  test("replaces tags from known tag ids", async () => {
    const sandbox = await createSandbox(sandboxSpec)
    closeSandbox = sandbox.close

    const response = await fetch(
      `${sandbox.baseUrl}/v1/contacts/id%3A11/tags/set`,
      {
        body: JSON.stringify({ tagIds: ["1"] }),
        headers: { "Content-Type": "application/json" },
        method: "PUT",
      },
    )

    expect(response.status).toBe(204)
    expect(
      sandbox.snapshot().contacts.find((contact) => contact.id === "11"),
    ).toMatchObject({
      tagIds: ["1"],
    })
  })

  test("keeps conversation replies scoped to the selected conversation", async () => {
    const sandbox = await createSandbox(sandboxSpec)
    closeSandbox = sandbox.close

    const response = await fetch(
      `${sandbox.baseUrl}/v1/conversations/41/messages`,
      {
        body: JSON.stringify({ text: "đã nhận" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
    )

    expect(response.status).toBe(201)
    expect(sandbox.snapshot().messages).toEqual([
      expect.objectContaining({ conversationId: "41", text: "đã nhận" }),
    ])
  })

  test("returns a booking response matching the public contract", async () => {
    const sandbox = await createSandbox(sandboxSpec)
    closeSandbox = sandbox.close

    const response = await fetch(`${sandbox.baseUrl}/v1/appointments`, {
      body: JSON.stringify({
        calendarId: "1",
        contactId: "11",
        startAt: "2026-09-24T02:00:00Z",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toMatchObject({
      calendarId: "1",
      contactId: "11",
      endAt: "2026-09-24T03:00:00Z",
      status: "scheduled",
    })
  })

  test("rejects an appointment racing after availability without a write", async () => {
    const sandbox = await createSandbox(sandboxSpec, {
      scenario: "appointment-unavailable",
    })
    closeSandbox = sandbox.close

    await fetch(
      `${sandbox.baseUrl}/v1/appointment-calendars/1/availability?startDate=2026-09-24&endDate=2026-09-25`,
    )
    const response = await fetch(`${sandbox.baseUrl}/v1/appointments`, {
      body: JSON.stringify({
        calendarId: "1",
        contactId: "11",
        startAt: "2026-09-24T02:00:00Z",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })

    expect(response.status).toBe(422)
    expect(sandbox.snapshot().appointments).toHaveLength(1)
    expect(sandbox.snapshot().journal).toHaveLength(0)
  })

  test("lists Messenger and starts its OAuth channel connection", async () => {
    const sandbox = await createSandbox(sandboxSpec)
    closeSandbox = sandbox.close

    const providers = await fetch(`${sandbox.baseUrl}/v1/connection-providers`)
    expect(providers.status).toBe(200)
    const providerCatalog = (await providers.json()) as {
      data: Record<string, unknown>[]
    }
    expect(providerCatalog.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: "messenger",
          strategy: "oauth_redirect",
        }),
      ]),
    )

    const response = await fetch(`${sandbox.baseUrl}/v1/connections`, {
      body: JSON.stringify({ provider: "messenger" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toMatchObject({
      connection: null,
      session: {
        id: "connect-session-1",
        nextAction: {
          type: "open_url",
          url: "https://connect.example.test/messenger",
        },
        status: "pending",
      },
    })
    expect(sandbox.snapshot().journal).toEqual([
      expect.objectContaining({
        operation: "connections.create",
        targetId: "connect-session-1",
      }),
    ])
  })

  test("connects selected pages from an authorized Messenger session", async () => {
    const sandbox = await createSandbox(sandboxSpec, {
      scenario: "connection-messenger-finish",
    })
    closeSandbox = sandbox.close

    const session = await fetch(
      `${sandbox.baseUrl}/v1/connect-sessions/connect-session-messenger`,
    )
    expect(session.status).toBe(200)
    await expect(session.json()).resolves.toMatchObject({
      status: "awaiting_selection",
      targets: [
        {
          id: "messenger-page-sales",
          selectable: true,
        },
      ],
    })

    const response = await fetch(
      `${sandbox.baseUrl}/v1/connect-sessions/connect-session-messenger/targets`,
      {
        body: JSON.stringify({ targetIds: ["messenger-page-sales"] }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      connections: [{ provider: "messenger", status: "connected" }],
      outcomes: [
        {
          status: "connected",
          targetId: "messenger-page-sales",
        },
      ],
      session: { status: "completed" },
    })
    expect(sandbox.snapshot()).toMatchObject({
      connectSessions: [{ status: "completed" }],
      connections: [{ provider: "messenger" }],
      journal: [
        expect.objectContaining({
          operation: "connectSessions.connectTargets",
          targetId: "connect-session-messenger",
        }),
      ],
    })
  })

  test("connects an API-key integration immediately", async () => {
    const sandbox = await createSandbox(sandboxSpec)
    closeSandbox = sandbox.close

    const response = await fetch(`${sandbox.baseUrl}/v1/connections`, {
      body: JSON.stringify({
        config: { apiKey: "sk-eval-claude-key" },
        provider: "claude",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toMatchObject({
      connection: {
        provider: "claude",
        status: "connected",
        strategy: "api_key",
      },
      session: null,
    })
    expect(sandbox.snapshot().connections).toEqual([
      expect.objectContaining({ provider: "claude" }),
    ])
  })

  test("reports unsupported fixture infrastructure instead of a false not-found", async () => {
    const unsupportedSpec = {
      paths: { "/v1/tags": { post: { operationId: "tags.create" } } },
    } as Parameters<typeof createSandbox>[0]
    const sandbox = await createSandbox(unsupportedSpec)
    closeSandbox = sandbox.close

    const response = await fetch(`${sandbox.baseUrl}/v1/tags`, {
      method: "POST",
    })

    expect(response.status).toBe(501)
    expect(sandbox.traces[0]).toMatchObject({
      fixtureError: "unsupported-operation",
      status: 501,
    })
  })

  test("denies every mutating fixture for a read-only token", async () => {
    const sandbox = await createSandbox(sandboxSpec, {
      scenario: "permission-denied",
    })
    closeSandbox = sandbox.close

    const response = await fetch(
      `${sandbox.baseUrl}/v1/contacts/id%3A11/tags`,
      {
        body: JSON.stringify({ tagIds: ["1"] }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
    )

    expect(response.status).toBe(403)
    expect(sandbox.snapshot().journal).toHaveLength(0)
  })
})
