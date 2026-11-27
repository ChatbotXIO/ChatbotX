import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

const actionHook = vi.hoisted(() => ({
  execute: vi.fn(),
  isExecuting: false,
  lastInput: undefined as { passTarget?: string } | undefined,
}))
vi.mock("@/features/conversations/hooks/use-thread-control-action", () => ({
  useThreadControlAction: (input: { passTarget?: string }) => {
    actionHook.lastInput = input
    return { execute: actionHook.execute, isExecuting: actionHook.isExecuting }
  },
}))

const takePermission = vi.hoisted(() => ({
  value: "unknown" as "allowed" | "forbidden" | "unknown",
  lastInput: undefined as { enabled: boolean; inboxId: string } | undefined,
}))
vi.mock("@/features/conversations/hooks/use-thread-take-permission", () => ({
  useThreadTakePermission: (input: { enabled: boolean; inboxId: string }) => {
    takePermission.lastInput = input
    return takePermission.value
  },
}))

const { ThreadControlPassPartnerDialog } = await import(
  "@/features/conversations/components/thread-control-pass-partner-dialog"
)

type Conversation = Parameters<
  typeof ThreadControlPassPartnerDialog
>[0]["conversation"]
type OwnerRole = Parameters<
  typeof ThreadControlPassPartnerDialog
>[0]["ownerRole"]

const conversation = { id: "conv-1", workspaceId: "ws-1" } as Conversation
const onOpenChange = vi.fn()

describe("ThreadControlPassPartnerDialog", () => {
  let container: HTMLDivElement
  let root: Root

  const render = (ownerRole: OwnerRole = "customer_service", open = true) =>
    act(() => {
      root.render(
        <ThreadControlPassPartnerDialog
          channel="whatsapp"
          contactInboxId="ci-1"
          conversation={conversation}
          inboxId="inbox-1"
          onOpenChange={onOpenChange}
          open={open}
          ownerRole={ownerRole}
        />,
      )
    })

  const typeNote = (value: string) => {
    const textarea = document.body.querySelector("textarea")
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set?.call(textarea, value)
    act(() => {
      textarea?.dispatchEvent(new Event("input", { bubbles: true }))
    })
  }
  const submit = async () => {
    await act(async () => {
      document.body
        .querySelector<HTMLButtonElement>('form button[type="submit"]')
        ?.click()
      // Let react-hook-form's async validation settle inside act.
      await Promise.resolve()
    })
  }
  const formButton = (label: string) =>
    Array.from(
      document.body.querySelectorAll<HTMLButtonElement>("form button"),
    ).find((button) => button.textContent?.includes(label))

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.clearAllMocks()
    actionHook.isExecuting = false
    takePermission.value = "unknown"
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  test("renders nothing while closed and passes for the escalation target", () => {
    render("customer_service", false)
    expect(document.body.textContent).not.toContain(
      "conversationRouting.pass.title",
    )

    render()
    expect(document.body.textContent).toContain(
      "conversationRouting.pass.title",
    )
    expect(actionHook.lastInput?.passTarget).toBe("escalation")
  })

  test("reads the stored roles of the thread's inbox only while open", () => {
    render("customer_service", false)
    expect(takePermission.lastInput).toMatchObject({
      enabled: false,
      inboxId: "inbox-1",
    })

    render()
    expect(takePermission.lastInput?.enabled).toBe(true)
  })

  test("by default hands over to the escalation partner as an untargeted pass", async () => {
    render()
    await submit()

    expect(actionHook.execute).toHaveBeenCalledExactlyOnceWith({
      contactInboxId: "ci-1",
      action: "pass",
      targetRole: undefined,
      metadata: undefined,
    })
  })

  test("sends the trimmed note with the pass", async () => {
    render()
    typeNote("  Refund approved, customer wants a replacement  ")
    await submit()

    expect(actionHook.execute).toHaveBeenCalledExactlyOnceWith({
      contactInboxId: "ci-1",
      action: "pass",
      targetRole: undefined,
      metadata: "Refund approved, customer wants a replacement",
    })
  })

  test("a whitespace-only note is dropped", async () => {
    render()
    typeNote("    ")
    await submit()

    expect(actionHook.execute).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: undefined }),
    )
  })

  test.each([
    [
      "an owner that took the thread (escalation role)",
      "escalation",
      "unknown",
    ],
    ["stored roles that include escalation", "customer_service", "allowed"],
  ] as const)("%s defaults to a targeted pass to customer service", async (_label, ownerRole, permission) => {
    takePermission.value = permission
    render(ownerRole)
    await submit()

    expect(actionHook.execute).toHaveBeenCalledExactlyOnceWith({
      contactInboxId: "ci-1",
      action: "pass",
      targetRole: "customer_service",
      metadata: undefined,
    })
  })

  const openRoleOptions = () => {
    act(() => {
      document.body
        .querySelector<HTMLElement>('[data-slot="select-trigger"]')
        ?.click()
    })
    return Array.from(
      document.body.querySelectorAll<HTMLElement>('[role="option"]'),
    )
  }
  const optionLabels = () =>
    openRoleOptions().map((option) => option.textContent?.trim())

  test("offers every role, escalation included, to an owner that is not the escalation partner", () => {
    render("customer_service")

    expect(optionLabels()).toEqual([
      "conversationRouting.roles.ai_agent",
      "conversationRouting.roles.ctwa",
      "conversationRouting.roles.customer_service",
      "conversationRouting.roles.escalation",
      "conversationRouting.roles.marketing",
      "conversationRouting.roles.utility",
    ])
  })

  test("never offers escalation to the escalation partner itself", () => {
    render("escalation")

    expect(optionLabels()).not.toContain("conversationRouting.roles.escalation")
    expect(optionLabels()).toContain(
      "conversationRouting.roles.customer_service",
    )
  })

  test("follows the stored roles when they arrive after the dialog opened", async () => {
    takePermission.value = "unknown"
    render()
    takePermission.value = "allowed"
    render()
    await submit()

    expect(actionHook.execute).toHaveBeenCalledExactlyOnceWith({
      contactInboxId: "ci-1",
      action: "pass",
      targetRole: "customer_service",
      metadata: undefined,
    })
  })

  test("keeps the role the agent picked when the stored roles arrive later", async () => {
    takePermission.value = "unknown"
    render()
    const marketing = openRoleOptions().find(
      (option) =>
        option.textContent?.trim() === "conversationRouting.roles.marketing",
    )
    act(() => {
      // Base UI selects on the pointer sequence, not on a bare click().
      for (const type of [
        "pointerdown",
        "mousedown",
        "pointerup",
        "mouseup",
        "click",
      ]) {
        marketing?.dispatchEvent(new MouseEvent(type, { bubbles: true }))
      }
    })
    takePermission.value = "allowed"
    render()
    await submit()

    expect(actionHook.execute).toHaveBeenCalledExactlyOnceWith({
      contactInboxId: "ci-1",
      action: "pass",
      targetRole: "marketing",
      metadata: undefined,
    })
  })

  test("a pick the choices stop offering is replaced, never sent as an untargeted pass from the escalation partner", async () => {
    takePermission.value = "unknown"
    render()
    const escalation = openRoleOptions().find(
      (option) =>
        option.textContent?.trim() === "conversationRouting.roles.escalation",
    )
    act(() => {
      for (const type of [
        "pointerdown",
        "mousedown",
        "pointerup",
        "mouseup",
        "click",
      ]) {
        escalation?.dispatchEvent(new MouseEvent(type, { bubbles: true }))
      }
    })
    takePermission.value = "allowed"
    render()
    await submit()

    expect(actionHook.execute).toHaveBeenCalledExactlyOnceWith({
      contactInboxId: "ci-1",
      action: "pass",
      targetRole: "customer_service",
      metadata: undefined,
    })
  })

  test("a note over Meta's 2000-character limit is refused before any call", async () => {
    render()
    typeNote("x".repeat(2001))
    await submit()

    expect(actionHook.execute).not.toHaveBeenCalled()
    // Said in the project's translated words, not zod's English sentence.
    expect(document.body.textContent).toContain("maxLength")
    expect(document.body.textContent).not.toContain("Too big")
  })

  test("keys typed in the note never reach the actions menu around the dialog", () => {
    const menuKeyDown = vi.fn()
    act(() => {
      root.render(
        // Stands in for the menu popup that wraps the dialog.
        <div onKeyDown={menuKeyDown} role="menu" tabIndex={-1}>
          <ThreadControlPassPartnerDialog
            channel="whatsapp"
            contactInboxId="ci-1"
            conversation={conversation}
            inboxId="inbox-1"
            onOpenChange={onOpenChange}
            open
            ownerRole="customer_service"
          />
        </div>,
      )
    })

    act(() => {
      document.body
        .querySelector("textarea")
        ?.dispatchEvent(
          new KeyboardEvent("keydown", { key: " ", bubbles: true }),
        )
    })

    expect(menuKeyDown).not.toHaveBeenCalled()
  })

  test("cancel closes the dialog without passing", () => {
    render()
    act(() => formButton("actions.cancel")?.click())

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(actionHook.execute).not.toHaveBeenCalled()
  })

  test("disables both buttons while the pass is running", () => {
    actionHook.isExecuting = true
    render()

    expect(formButton("actions.cancel")?.disabled).toBe(true)
    expect(formButton("conversationRouting.pass.confirm")?.disabled).toBe(true)
  })

  test("closes once the pass settles (a failure keeps its toast)", () => {
    actionHook.isExecuting = true
    render()
    expect(onOpenChange).not.toHaveBeenCalled()

    actionHook.isExecuting = false
    render()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
