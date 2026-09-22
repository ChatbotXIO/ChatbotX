import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { GetContactResponse } from "@/features/contacts/schema/query"

/**
 * Regression coverage for the reset-custom-fields affordance in
 * `ContactDetail`. The reset button and the reset filter must be keyed on the
 * ROW being a custom field, not on `contact.customFields`: a field added and
 * saved during the session is not in the cached contact yet, but its value
 * is in the database, so reset must be enabled and must clear that row.
 */

const translate = (key: string) => key
vi.mock("next-intl", () => ({
  useTranslations: () => translate,
}))

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

vi.mock("@/hooks/routing", () => ({
  useWorkspaceId: () => "ws-1",
}))

type MockConversation = {
  id: string
  contact: {
    id: string
    firstName: string | null
    lastName: string | null
    email: string | null
    phoneNumber: string | null
    gender: string | null
    timezone: string | null
  }
  contactInboxes: never[]
}

const chatStoreState = {
  conversations: [] as MockConversation[],
  updateContact: vi.fn(),
}
vi.mock("@/features/chat/store/chat-store-provider", () => ({
  useChatStore: (selector: (state: typeof chatStoreState) => unknown) =>
    selector(chatStoreState),
}))

vi.mock(
  "@/features/integration-whatsapp/calling/voip/use-outbound-call-mode",
  () => ({
    useOutboundCallMode: () => ({
      data: undefined,
      isError: false,
      error: null,
    }),
  }),
)
vi.mock(
  "@/features/integration-whatsapp/calling/voip/whatsapp-voip-call-context",
  () => ({
    useOptionalWhatsappVoipCallContext: () => null,
  }),
)
vi.mock(
  "@/features/integration-whatsapp/calling/request-call-permission-dialog",
  () => ({
    RequestCallPermissionDialog: (props: { children: React.ReactNode }) =>
      props.children,
  }),
)
vi.mock(
  "@/features/integration-whatsapp/calling/voip/use-whatsapp-call-starter",
  () => ({
    useWhatsappCallStarter: () => ({
      voipCallContext: null,
      isResolvingMode: false,
      isVoipMode: false,
      canDialDirectly: false,
      isDialing: false,
      handleClick: vi.fn(),
      dialogs: null,
    }),
  }),
)

vi.mock("@/features/contacts/utils", () => ({
  useAvatarUrl: () => undefined,
}))

vi.mock("@/features/contact-filter/lib/timezone", () => ({
  getBrowserTimezone: () => "UTC",
}))

// The picker is reduced to one button that "chooses" a fixed workspace field
// the contact does not hold yet.
const PICKED_FIELD = {
  id: "cf-picked",
  name: "Picked field",
  type: "shortText",
}
vi.mock("@/features/custom-fields/contact-custom-field-manage", () => ({
  ContactCustomFieldManage: ({
    onChooseCustomField,
  }: {
    onChooseCustomField: (field: typeof PICKED_FIELD) => void
  }) => (
    <button
      data-testid="pick-custom-field"
      onClick={() => onChooseCustomField(PICKED_FIELD)}
      type="button"
    >
      pick
    </button>
  ),
}))

// The reset dialog is reduced to its two contract points: `disabled` and
// `onSuccess` (fired as if the server-side reset just succeeded).
vi.mock("@/features/contacts/reset-contact-custom-fields-dialog", () => ({
  ResetContactCustomFieldsDialog: ({
    disabled,
    onSuccess,
  }: {
    disabled: boolean
    onSuccess: () => void
  }) => (
    <button
      data-testid="reset-custom-fields"
      disabled={disabled}
      onClick={onSuccess}
      type="button"
    >
      reset
    </button>
  ),
}))

vi.mock("@/features/contacts/edit-contact-field", () => ({
  EditContactField: () => null,
}))

const { ContactDetail } = await import("@/features/contacts/contact-detail")

const conversation: MockConversation = {
  id: "conv-1",
  contact: {
    id: "contact-1",
    firstName: "Ada",
    lastName: "Lovelace",
    email: null,
    phoneNumber: null,
    gender: null,
    timezone: null,
  },
  contactInboxes: [],
}

const buildContact = (
  customFields: GetContactResponse["customFields"],
): GetContactResponse =>
  ({
    id: "contact-1",
    workspaceId: "ws-1",
    firstName: "Ada",
    lastName: "Lovelace",
    fullName: "Ada Lovelace",
    email: null,
    phoneNumber: null,
    gender: null,
    timezone: null,
    customFields,
    tags: [],
    contactNotes: [],
    contactsOnSequences: [],
  }) as unknown as GetContactResponse

const heldField = {
  id: "cf-held",
  workspaceId: "ws-1",
  folderId: null,
  name: "Held field",
  type: "shortText",
  value: "held value",
} as unknown as GetContactResponse["customFields"][number]

let container: HTMLDivElement | null = null
let root: Root | null = null

function render(ui: React.ReactElement) {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(ui)
  })
  return container
}

function resetButton(): HTMLButtonElement {
  const button = container?.querySelector<HTMLButtonElement>(
    '[data-testid="reset-custom-fields"]',
  )
  if (!button) {
    throw new Error("reset button not rendered")
  }
  return button
}

function click(testId: string) {
  const button = container?.querySelector<HTMLButtonElement>(
    `[data-testid="${testId}"]`,
  )
  if (!button) {
    throw new Error(`${testId} not rendered`)
  }
  act(() => {
    button.click()
  })
}

afterEach(() => {
  if (root) {
    act(() => {
      root?.unmount()
    })
  }
  container?.remove()
  container = null
  root = null
})

describe("ContactDetail — reset custom fields", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    chatStoreState.conversations = [conversation]
  })

  test("is disabled when the contact holds no custom-field rows", () => {
    render(
      <ContactDetail
        activeConversationId="conv-1"
        contact={buildContact([])}
        onCustomFieldsReset={vi.fn()}
      />,
    )

    expect(resetButton().disabled).toBe(true)
    expect(container?.textContent).not.toContain("Held field")
  })

  test("is enabled by a held value and clears only the custom-field rows", () => {
    const onCustomFieldsReset = vi.fn()
    render(
      <ContactDetail
        activeConversationId="conv-1"
        contact={buildContact([heldField])}
        onCustomFieldsReset={onCustomFieldsReset}
      />,
    )

    expect(resetButton().disabled).toBe(false)
    expect(container?.textContent).toContain("Held field")

    click("reset-custom-fields")

    expect(onCustomFieldsReset).toHaveBeenCalledTimes(1)
    expect(container?.textContent).not.toContain("Held field")
    // Built-in contact fields survive a custom-field reset.
    expect(container?.textContent).toContain("fields.firstName.label")
  })

  test("is enabled by a field added this session even though the cached contact lacks it", () => {
    const onCustomFieldsReset = vi.fn()
    render(
      <ContactDetail
        activeConversationId="conv-1"
        contact={buildContact([])}
        onCustomFieldsReset={onCustomFieldsReset}
      />,
    )
    expect(resetButton().disabled).toBe(true)

    click("pick-custom-field")

    expect(container?.textContent).toContain("Picked field")
    expect(resetButton().disabled).toBe(false)

    click("reset-custom-fields")

    expect(onCustomFieldsReset).toHaveBeenCalledTimes(1)
    expect(container?.textContent).not.toContain("Picked field")
    expect(resetButton().disabled).toBe(true)
  })
})
