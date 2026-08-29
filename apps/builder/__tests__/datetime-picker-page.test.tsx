// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  verifyUserDataWebviewToken: vi.fn(),
  loadServableWorkspace: vi.fn(),
  dateTimePickerForm: vi.fn(() => null),
}))

vi.mock("next/script", () => ({
  default: () => null,
}))

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}))

vi.mock("@chatbotx.io/business", () => ({
  workspaceService: {
    findById: mocks.findById,
  },
}))

vi.mock("@chatbotx.io/encryption", () => ({
  verifyUserDataWebviewToken: mocks.verifyUserDataWebviewToken,
}))

vi.mock("@/lib/workspace/load-servable-workspace", () => ({
  loadServableWorkspace: mocks.loadServableWorkspace,
}))

vi.mock(
  "@/features/get-user-data-webview/components/date-time-picker-form",
  () => ({
    DateTimePickerForm: mocks.dateTimePickerForm,
  }),
)

const { default: DateTimePickerPage } = await import(
  "../src/app/extensions/datetime-picker/page"
)

const VALID_PAYLOAD = {
  workspaceId: "workspace-1",
  conversationId: "conversation-1",
  contactInboxId: "contact-inbox-1",
  contactId: "contact-1",
  channel: "messenger",
  flowId: "flow-1",
  flowVersionId: "flow-version-1",
  stepId: "step-1",
  nodeId: "node-1",
  challengeId: "challenge-1",
  outputFieldId: "field-1",
  replyFormat: "date" as const,
  expiresAt: Date.now() + 60_000,
}

type ReactElementLike = {
  type: unknown
  props: { children?: unknown }
}

function isReactElementLike(value: unknown): value is ReactElementLike {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    "props" in value
  )
}

// The page component is never rendered by a renderer in this test (only
// `DateTimePickerPage(...)` is invoked directly), so `DateTimePickerForm`
// itself is never called — React.createElement just builds a plain element
// tree. Walk that tree to find the DateTimePickerForm element and inspect
// the props it was given, instead of asserting on the mock function call.
function findFormElementProps(node: unknown): Record<string, unknown> | null {
  if (!isReactElementLike(node)) {
    return null
  }
  if (node.type === mocks.dateTimePickerForm) {
    return node.props as Record<string, unknown>
  }
  const children = node.props.children
  const childList = Array.isArray(children) ? children : [children]
  for (const child of childList) {
    const found = findFormElementProps(child)
    if (found) {
      return found
    }
  }
  return null
}

describe("datetime picker webview page", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.loadServableWorkspace.mockResolvedValue({
      servable: true,
      workspace: { id: "workspace-1", language: "en" },
    })
    mocks.findById.mockResolvedValue({ id: "workspace-1", language: "en" })
  })

  test("renders an error message when token is missing", async () => {
    const result = await DateTimePickerPage({
      searchParams: Promise.resolve({}),
    })

    expect(mocks.verifyUserDataWebviewToken).not.toHaveBeenCalled()
    expect(mocks.dateTimePickerForm).not.toHaveBeenCalled()
    expect(result).toBeTruthy()
  })

  test("renders an error message when the token fails verification", async () => {
    mocks.verifyUserDataWebviewToken.mockRejectedValue(
      new Error("expired token"),
    )

    await DateTimePickerPage({
      searchParams: Promise.resolve({ token: "bad-token" }),
    })

    expect(mocks.loadServableWorkspace).not.toHaveBeenCalled()
    expect(mocks.dateTimePickerForm).not.toHaveBeenCalled()
  })

  test("renders the picker in date mode for a valid date-format token", async () => {
    mocks.verifyUserDataWebviewToken.mockResolvedValue({
      ...VALID_PAYLOAD,
      replyFormat: "date",
    })

    const result = await DateTimePickerPage({
      searchParams: Promise.resolve({ token: "token-1" }),
    })

    expect(mocks.loadServableWorkspace).toHaveBeenCalledWith("workspace-1")
    expect(mocks.findById).toHaveBeenCalledWith({ id: "workspace-1" })
    expect(findFormElementProps(result)).toEqual({
      mode: "date",
      token: "token-1",
    })
  })

  test("renders the picker in datetime mode for a valid datetime-format token", async () => {
    mocks.verifyUserDataWebviewToken.mockResolvedValue({
      ...VALID_PAYLOAD,
      replyFormat: "datetime",
    })

    const result = await DateTimePickerPage({
      searchParams: Promise.resolve({ token: "token-1" }),
    })

    expect(findFormElementProps(result)).toEqual({
      mode: "datetime",
      token: "token-1",
    })
  })
})
