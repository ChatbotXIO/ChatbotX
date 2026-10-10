// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Flow JSON references are literal `${...}` text
import type { MiniAppDefinition } from "@chatbotx.io/mini-app"
import { beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("server-only", () => ({}))

const findRecentByContactId = vi.fn()
const integrationWhatsappFind = vi.fn()
vi.mock("@chatbotx.io/business", () => ({
  contactInboxService: { findRecentByContactId },
  integrationWhatsappService: { findByIdForWorkspace: integrationWhatsappFind },
  whatsappFlowService: { upsertFromMeta },
}))

const upsertFromMeta = vi.fn()
const recordPublication = vi.fn()
const runWhatsappAction = vi.fn()

const getAll = vi.fn()
const replaceAll = vi.fn()
vi.mock("@chatbotx.io/variables", () => ({
  contactVariableService: { getAll, replaceAll },
}))

vi.mock("@chatbotx.io/logger", () => ({
  getChildLogger: () => ({ warn: vi.fn() }),
}))

const findOrFail = vi.fn()
vi.mock("@chatbotx.io/business/mini-app", () => ({
  miniAppService: {
    findOrFail,
    validate: () => ({ valid: true, issues: [] }),
  },
  miniAppPublicationService: {
    findForIntegration: vi.fn(),
    record: recordPublication,
  },
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {
    code: string
    constructor(message: string, code: string) {
      super(message)
      this.code = code
    }
  },
  notFoundException: (message: string) => new Error(message),
  validationException: (field: string, message: string) =>
    Object.assign(new Error(message), { code: "validation", field }),
}))

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}))
vi.mock(
  "@/features/integration-whatsapp/flows/lib/whatsapp-flow-operations",
  () => ({ buildWhatsappContext: vi.fn() }),
)
vi.mock("@/integration", () => ({
  integrations: { whatsapp: { runAction: runWhatsappAction } },
}))

const { resolveContactVariables } = await import(
  "../src/features/mini-apps/lib/resolve-contact-variables"
)
const { publishMiniAppToWhatsapp } = await import(
  "../src/features/mini-apps/lib/publish-to-whatsapp"
)

const definition = {
  version: "7.3",
  screens: [
    {
      key: "s1",
      id: "SCREEN_A",
      title: "Hi {{first_name}}",
      terminal: true,
      children: [
        {
          id: "n1",
          type: "TextInput",
          props: { name: "phone", label: "Phone of {{first_name}}" },
        },
        {
          id: "n2",
          type: "RadioButtonsGroup",
          props: {
            name: "plan",
            label: "Plan",
            "data-source": [{ id: "basic", title: "Plan of {{last_name}}" }],
          },
        },
      ],
    },
  ],
} as unknown as MiniAppDefinition

const firstScreen = (result: MiniAppDefinition) =>
  result.screens[0] as unknown as {
    title: string
    children: { props: Record<string, unknown> }[]
  }

let contactValues: Record<string, string> = {}

beforeEach(() => {
  vi.clearAllMocks()
  contactValues = { first_name: "An", last_name: "Tran" }
  findRecentByContactId.mockResolvedValue({ id: "ci-1" })
  getAll.mockResolvedValue({ contact: { id: "c-1" } })
  // Mirrors contactVariableService.replaceAll: each value goes through
  // `escapeValue` before it is put into the text.
  replaceAll.mockImplementation(
    async ({
      text,
      escapeValue = (value) => value,
    }: {
      text: string
      escapeValue?: (value: string) => string
    }) =>
      text.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
        name in contactValues
          ? escapeValue(contactValues[name] as string)
          : match,
      ),
  )
})

const singleNodeDefinition = (
  node: Record<string, unknown>,
): MiniAppDefinition =>
  ({
    version: "7.3",
    screens: [
      { key: "s1", id: "A", title: "", terminal: true, children: [node] },
    ],
  }) as unknown as MiniAppDefinition

describe("resolveContactVariables", () => {
  test("swaps variables for the contact's values", async () => {
    const screen = firstScreen(
      await resolveContactVariables({
        definition,
        workspaceId: "ws-1",
        contactId: "c-1",
      }),
    )
    expect(findRecentByContactId).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "c-1",
    })
    expect(screen.title).toBe("Hi An")
    expect(screen.children[0]?.props.label).toBe("Phone of An")
    expect(screen.children[1]?.props["data-source"]).toEqual([
      { id: "basic", title: "Plan of Tran" },
    ])
  })

  test("resolves custom fields for a contact without an inbox", async () => {
    findRecentByContactId.mockResolvedValue(undefined)
    const screen = firstScreen(
      await resolveContactVariables({
        definition,
        workspaceId: "ws-1",
        contactId: "c-1",
      }),
    )
    expect(getAll).toHaveBeenCalledWith({
      contactId: "c-1",
      contactInbox: null,
    })
    expect(screen.title).toBe("Hi An")
  })

  test("keeps a value from being read as a reference or a variable", async () => {
    contactValues.first_name = "${screen.PAY.form.card} {{last_name}}"
    const screen = firstScreen(
      await resolveContactVariables({
        definition,
        workspaceId: "ws-1",
        contactId: "c-1",
      }),
    )
    expect(screen.title).toBe(
      "Hi $\u2060{screen.PAY.form.card} {\u2060{last_name}}",
    )
  })

  test("escapes markdown only where the text is rendered as markdown", async () => {
    contactValues.first_name = "**An** [x](https://evil.test)"
    const resolved = await resolveContactVariables({
      definition: singleNodeDefinition({
        id: "r",
        type: "RichText",
        props: { text: "Hi {{first_name}}" },
      }),
      workspaceId: "ws-1",
      contactId: "c-1",
    })
    expect(firstScreen(resolved).children[0]?.props.text).toBe(
      "Hi \\*\\*An\\*\\* \\[x\\]\\(https://evil\\.test\\)",
    )

    const plain = await resolveContactVariables({
      definition: singleNodeDefinition({
        id: "h",
        type: "TextHeading",
        props: { text: "Hi {{first_name}}" },
      }),
      workspaceId: "ws-1",
      contactId: "c-1",
    })
    expect(firstScreen(plain).children[0]?.props.text).toBe(
      "Hi **An** [x](https://evil.test)",
    )
  })

  test("escapes quotes inside a nested expression", async () => {
    contactValues.first_name = "O'Neil"
    const resolved = await resolveContactVariables({
      definition: singleNodeDefinition({
        id: "h",
        type: "TextHeading",
        props: { text: "`'Hi {{first_name}} ' ${form.city}`" },
      }),
      workspaceId: "ws-1",
      contactId: "c-1",
    })
    expect(firstScreen(resolved).children[0]?.props.text).toBe(
      "`'Hi O\\'Neil ' ${form.city}`",
    )
  })

  test("drops variables for an anonymous visitor", async () => {
    const screen = firstScreen(
      await resolveContactVariables({ definition, workspaceId: "ws-1" }),
    )
    expect(getAll).not.toHaveBeenCalled()
    expect(screen.title).toBe("Hi ")
    expect(screen.children[0]?.props.label).toBe("Phone of ")
  })

  test("drops variables when the lookup fails", async () => {
    getAll.mockRejectedValue(new Error("contact gone"))
    const screen = firstScreen(
      await resolveContactVariables({
        definition,
        workspaceId: "ws-1",
        contactId: "c-1",
      }),
    )
    expect(screen.children[0]?.props.label).toBe("Phone of ")
  })

  test("leaves the stored definition untouched", async () => {
    await resolveContactVariables({
      definition,
      workspaceId: "ws-1",
      contactId: "c-1",
    })
    expect(definition.screens[0]?.title).toBe("Hi {{first_name}}")
  })
})

describe("publishMiniAppToWhatsapp", () => {
  test("refuses a Mini App whose texts hold custom fields", async () => {
    findOrFail.mockResolvedValue({ id: "10", definition })
    await expect(
      publishMiniAppToWhatsapp({
        workspaceId: "ws-1",
        miniAppId: "10",
        integrationWhatsappId: "wa-1",
      }),
    ).rejects.toMatchObject({ code: "validation", field: "definition" })
    expect(integrationWhatsappFind).not.toHaveBeenCalled()
  })

  test("a refused publish records the draft and surfaces Meta's reason", async () => {
    findOrFail.mockResolvedValue({
      id: "10",
      name: "Signup",
      definition: { screens: [] },
      flowJson: {},
    })
    integrationWhatsappFind.mockResolvedValue({ id: "wa-1" })
    runWhatsappAction.mockResolvedValue({
      flow: {
        id: "meta-1",
        name: "Signup",
        status: "DRAFT",
        categories: [],
        validation_errors: [],
      },
      published: false,
      publishError: "Verify your business before publishing.",
    })
    upsertFromMeta.mockResolvedValue({ id: "flow-row-1" })
    recordPublication.mockImplementation(async (input: object) => input)

    const result = await publishMiniAppToWhatsapp({
      workspaceId: "ws-1",
      miniAppId: "10",
      integrationWhatsappId: "wa-1",
    })

    expect(recordPublication).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: "meta-1",
        status: "DRAFT",
        validationErrors: [
          { message: "Verify your business before publishing." },
        ],
        published: false,
      }),
    )
    expect(result.published).toBe(false)
  })
})
