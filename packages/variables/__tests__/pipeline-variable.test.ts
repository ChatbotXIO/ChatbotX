import { PIPELINE_VARIABLE_ATTRIBUTES } from "@chatbotx.io/database/partials"
import type {
  ContactInboxModel,
  ContactModel,
  WorkspaceModel,
} from "@chatbotx.io/database/types"
import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockLoadTargets, mockLoadLastItemId, mockContactFindFirst } =
  vi.hoisted(() => ({
    mockLoadTargets: vi.fn(),
    mockLoadLastItemId: vi.fn(),
    mockContactFindFirst: vi.fn(),
  }))

vi.mock("@chatbotx.io/business/pipeline/variable-targets", () => ({
  loadPipelineVariableTargets: mockLoadTargets,
  loadLastPipelineItemId: mockLoadLastItemId,
}))

vi.mock("@chatbotx.io/business", () => ({
  botFieldWorkspaceCacheTags: (workspaceId: string) => [
    "bot-fields",
    `bot-fields:${workspaceId}`,
  ],
  appointmentService: { findBy: vi.fn(), findLatestForContact: vi.fn() },
  contactInboxService: {
    findLatestLastIncomingMessageAtByContactId: vi.fn(),
  },
  messageService: { listIncomingTextsByContactInbox: vi.fn() },
  resolveTenantSettings: vi.fn(),
  workspaceService: { find: vi.fn() },
}))

vi.mock("@chatbotx.io/business/contact-locale", () => ({
  languageFromLocale: () => null,
  normalizeStoredTimezone: (value: string | null) => value,
  offsetFromStoredTimezone: () => null,
}))

vi.mock("@chatbotx.io/business/system-field", () => ({
  resolveGenderLabel: () => null,
}))

vi.mock("@chatbotx.io/business/workspace-lifecycle/predicates", () => ({
  isWorkspaceScheduledForDeletion: () => false,
}))

vi.mock("@chatbotx.io/business/coupon", () => ({
  couponService: { resolveCouponVariable: vi.fn() },
}))

vi.mock("@chatbotx.io/business/utils", () => ({
  getPublicFileUrl: (path: string, baseUrl: string) =>
    new URL(path, baseUrl).toString(),
}))

vi.mock("@chatbotx.io/redis", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/redis")>()),
  withCache: async (_key: string, fn: () => Promise<unknown>) => fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      contactModel: { findFirst: mockContactFindFirst },
      contactInboxModel: { findFirst: vi.fn() },
      contactCustomFieldModel: { findMany: vi.fn().mockResolvedValue([]) },
      botFieldModel: { findMany: vi.fn().mockResolvedValue([]) },
    },
  },
}))

const { contactVariableService } = await import("../src/contact-variable")
const { resolveContactVariablesDeep } = await import(
  "../src/deep-replace-contact-variables"
)
const { resolveJavascriptInput } = await import(
  "../src/javascript-interpolation"
)
const { createContactPipelineItemsLoader, parsePipelineVariable } =
  await import("../src/pipeline-variable")

const contact = {
  id: "contact-1",
  workspaceId: "workspace-1",
  firstName: "Ada",
  locale: null,
  timezone: "UTC",
} as ContactModel
const contactInbox = { id: "inbox-1" } as ContactInboxModel
const workspace = { id: "workspace-1", timezone: "UTC" } as WorkspaceModel

const sales = {
  id: "900",
  referenceName: "sales",
  name: "Big deal",
  stageName: "Qualified",
  status: "won" as const,
  statusLabel: "Closed won",
  priority: "high" as const,
  value: 1234.5,
  currency: "USD",
  assignedAdmins: ["Alice", "Bob"],
  createdAt: new Date("2026-10-01T12:00:00Z"),
  dueDate: new Date("2026-10-20T12:00:00Z"),
  updatedAt: new Date("2026-10-05T12:00:00Z"),
}

// Like `contactVariableService.getAll`: every context owns one lazy loader.
const makeContext = () => ({
  contact,
  contactInbox,
  workspace,
  conversation: null,
  customFieldsMap: new Map(),
  pipelineItems: createContactPipelineItemsLoader(contact),
})

const render = (text: string) =>
  contactVariableService.replaceAll({ text, variables: makeContext() })

beforeEach(() => {
  vi.clearAllMocks()
  mockLoadTargets.mockResolvedValue([sales])
})

describe("parsePipelineVariable", () => {
  test("accepts exactly pipelines.<reference_name>.<attribute>", () => {
    expect(parsePipelineVariable("pipelines.sales.stage_name")).toEqual({
      referenceName: "sales",
      attribute: "stage_name",
    })
    for (const bad of [
      "pipelines.sales",
      "pipelines.sales.unknown",
      "pipelines.Sales.name",
      "pipelines.sales.name.extra",
      "pipelines..name",
      "pipeline.sales.name",
    ]) {
      expect(parsePipelineVariable(bad)).toBeNull()
    }
  })
})

describe("pipeline variables in message text", () => {
  test("resolves all ten attributes from the contact's item", async () => {
    const expected: Record<
      (typeof PIPELINE_VARIABLE_ATTRIBUTES)[number],
      string
    > = {
      name: "Big deal",
      stage_name: "Qualified",
      status: "Closed won",
      priority: "high",
      value: "USD 1,234.50",
      assigned_admins: "Alice, Bob",
      created_date: expect.any(String),
      due_date: expect.any(String),
      updated_date: expect.any(String),
      id: "900",
    }

    for (const attribute of PIPELINE_VARIABLE_ATTRIBUTES) {
      const rendered = await render(`{{pipelines.sales.${attribute}}}`)
      expect(rendered).toEqual(expected[attribute])
      expect(rendered).not.toBe("")
    }
    expect(await render("{{pipelines.sales.created_date}}")).toContain("2026")
    expect(await render("{{pipelines.sales.due_date}}")).toContain("2026")
  })

  test("an unknown pipeline renders empty, a malformed token stays literal", async () => {
    expect(await render("[{{pipelines.nope.name}}]")).toBe("[]")
    expect(await render("[{{pipelines.sales.bogus}}]")).toBe(
      "[{{pipelines.sales.bogus}}]",
    )
  })

  test("empty value, due date and admins render empty", async () => {
    mockLoadTargets.mockResolvedValue([
      { ...sales, value: null, dueDate: null, assignedAdmins: [] },
    ])

    expect(
      await render(
        "[{{pipelines.sales.value}}|{{pipelines.sales.due_date}}|{{pipelines.sales.assigned_admins}}]",
      ),
    ).toBe("[||]")
  })

  test("loads once per replaceAll however many variables it has", async () => {
    await render(
      "{{pipelines.sales.name}} {{pipelines.sales.status}} {{pipelines.support.id}}",
    )

    expect(mockLoadTargets).toHaveBeenCalledTimes(1)
    expect(mockLoadTargets).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactId: "contact-1",
    })
  })

  test("one context shares a single load across separate replaceAll calls", async () => {
    const variables = makeContext()

    await contactVariableService.replaceAll({
      text: "{{pipelines.sales.name}}",
      variables,
    })
    await contactVariableService.replaceAll({
      text: "{{pipelines.sales.id}}",
      variables,
    })

    expect(mockLoadTargets).toHaveBeenCalledTimes(1)
  })

  test("does not load anything when no pipeline variable is used", async () => {
    await render("Hi {{first_name}}")

    expect(mockLoadTargets).not.toHaveBeenCalled()
  })

  test("reuses a context whose items are already loading", async () => {
    const pipelineItems = { get: () => Promise.resolve([sales]) }

    const text = await contactVariableService.replaceAll({
      text: "{{pipelines.sales.name}}",
      variables: { ...makeContext(), pipelineItems },
    })

    expect(text).toBe("Big deal")
    expect(mockLoadTargets).not.toHaveBeenCalled()
  })
})

describe("{{last_opportunity_id}}", () => {
  test("renders the contact's last created or updated item id", async () => {
    mockLoadLastItemId.mockResolvedValue("9001")

    const text = await render("Ref {{last_opportunity_id}}")

    expect(text).toBe("Ref 9001")
    expect(mockLoadLastItemId).toHaveBeenCalledWith({
      workspaceId: contact.workspaceId,
      contactId: contact.id,
    })
    expect(mockLoadTargets).not.toHaveBeenCalled()
  })

  test("repeated tokens in one context query once", async () => {
    mockLoadLastItemId.mockResolvedValue("9001")

    const text = await render("{{last_opportunity_id}}-{{last_opportunity_id}}")

    expect(text).toBe("9001-9001")
    expect(mockLoadLastItemId).toHaveBeenCalledTimes(1)
  })

  test("renders empty when the contact has no item", async () => {
    mockLoadLastItemId.mockResolvedValue(null)

    expect(await render("Ref [{{last_opportunity_id}}]")).toBe("Ref []")
  })

  test("is not queried when the text does not use it", async () => {
    await render("Hello {{first_name}}")

    expect(mockLoadLastItemId).not.toHaveBeenCalled()
  })
})

describe("pipeline items are loaded lazily", () => {
  test("text that only mentions pipelines. outside a token does not query", async () => {
    mockContactFindFirst.mockResolvedValue(contact)

    await render("see pipelines.sales.name and {{first_name}}")
    await resolveContactVariablesDeep(
      "contact-1",
      { note: "pipelines.sales.name {{first_name}}" },
      { contactInbox, workspace },
    )

    expect(mockLoadTargets).not.toHaveBeenCalled()
  })

  test("a rejecting loader that nothing awaits raises no unhandled rejection", async () => {
    mockLoadTargets.mockRejectedValue(new Error("db down"))
    const unhandled = vi.fn()
    process.on("unhandledRejection", unhandled)
    try {
      // The structure carries a pipeline token but only in a branch the
      // renderer never resolves, so the loader must not have started.
      await render("{{first_name}}")
      const variables = makeContext()
      await contactVariableService.replaceAll({
        text: "{{first_name}}",
        variables,
      })
      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(mockLoadTargets).not.toHaveBeenCalled()
      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      process.off("unhandledRejection", unhandled)
    }
  })

  test("a rejecting loader still fails a render that reads a pipeline variable", async () => {
    mockLoadTargets.mockRejectedValue(new Error("db down"))

    await expect(render("{{pipelines.sales.name}}")).rejects.toThrow()
  })
})

describe("pipeline variables in JavaScript steps", () => {
  test("resolve to the same strings as in message text", async () => {
    const names = PIPELINE_VARIABLE_ATTRIBUTES.map(
      (attribute) => `pipelines.sales.${attribute}`,
    )
    const code = names.map((name) => `{{${name}}}`).join(" ")

    const resolved = await resolveJavascriptInput(code, makeContext())

    for (const name of names) {
      expect(resolved.get(name)).toBe(await render(`{{${name}}}`))
    }
    expect(resolved.get("pipelines.nope.name")).toBeUndefined()
  })

  test("loads once for the whole snippet", async () => {
    await resolveJavascriptInput(
      "{{pipelines.sales.name}} {{pipelines.sales.value}} {{pipelines.sales.id}}",
      makeContext(),
    )

    expect(mockLoadTargets).toHaveBeenCalledTimes(1)
  })
})

describe("pipeline variables in deep replace", () => {
  test("resolve in every string leaf with one load, matching message text", async () => {
    mockContactFindFirst.mockResolvedValue(contact)

    const result = await resolveContactVariablesDeep(
      "contact-1",
      {
        title: "{{pipelines.sales.name}}",
        nested: [
          {
            line: "{{pipelines.sales.value}} in {{pipelines.sales.stage_name}}",
          },
        ],
        unknown: "[{{pipelines.nope.status}}]",
      },
      { contactInbox, workspace },
    )

    expect(result).toEqual({
      title: await render("{{pipelines.sales.name}}"),
      nested: [{ line: "USD 1,234.50 in Qualified" }],
      unknown: "[]",
    })
    // One load for the deep structure, one for each `render` call above.
    expect(mockLoadTargets).toHaveBeenCalledTimes(2)
  })

  test("does not load pipeline items for a structure that never references them", async () => {
    mockContactFindFirst.mockResolvedValue(contact)

    await resolveContactVariablesDeep(
      "contact-1",
      { greeting: "Hi {{first_name}}" },
      { contactInbox, workspace },
    )

    expect(mockLoadTargets).not.toHaveBeenCalled()
  })
})
