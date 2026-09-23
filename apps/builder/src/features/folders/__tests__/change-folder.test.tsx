// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { ChangeFolderDialog } from "../change-folder"

const { actionSuccess, mockRefresh } = vi.hoisted(() => ({
  actionSuccess: { current: undefined as (() => void) | undefined },
  mockRefresh: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("@hookform/resolvers/zod", () => ({
  zodResolver: vi.fn(),
}))

vi.mock("@next-safe-action/adapter-react-hook-form/hooks", () => ({
  useHookFormAction: (
    _action: unknown,
    _resolver: unknown,
    options: { actionProps: { onSuccess: () => void } },
  ) => {
    actionSuccess.current = options.actionProps.onSuccess
    return {
      form: {
        formState: { isSubmitting: false, isValid: true },
        setValue: vi.fn(),
      },
      handleSubmitWithAction: vi.fn(),
      resetFormAndAction: vi.fn(),
    }
  },
}))

vi.mock("@chatbotx.io/ui/components/form/combobox-field", () => ({
  ComboboxField: () => null,
}))

vi.mock("@chatbotx.io/ui/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ComponentProps<"button">) => (
    <button {...props}>{children}</button>
  ),
}))

vi.mock("@chatbotx.io/ui/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogDescription: () => null,
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h1>{children}</h1>
  ),
  DialogTrigger: () => null,
}))

vi.mock("@chatbotx.io/ui/components/ui/form", () => ({
  Form: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }))
vi.mock("../actions/change-folder.action", () => ({
  changeFolderAction: vi.fn(),
}))
vi.mock("../provider/folder-hook", () => ({ useFolderSelectOptions: () => [] }))
vi.mock("../schema/action", () => ({ changeFolderRequest: {} }))

describe("ChangeFolderDialog", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    actionSuccess.current = undefined
    mockRefresh.mockClear()
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  test("calls onSuccess after the folder change succeeds", () => {
    const onSuccess = vi.fn()

    act(() => {
      root.render(
        <ChangeFolderDialog
          currentFolderId={null}
          folderType="flow"
          modelIds={["flow-1"]}
          onOpenChange={() => undefined}
          onSuccess={onSuccess}
          open
          workspaceId="workspace-1"
        />,
      )
    })

    act(() => {
      actionSuccess.current?.()
    })

    expect(onSuccess).toHaveBeenCalledOnce()
    expect(mockRefresh).toHaveBeenCalledOnce()
  })
})
