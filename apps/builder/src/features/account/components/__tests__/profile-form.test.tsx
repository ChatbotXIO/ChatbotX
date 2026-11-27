// @vitest-environment jsdom

import type React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ProfileForm } from "../profile-form"

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  updateUser: vi.fn(),
}))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}))

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}))

vi.mock("@/lib/auth/auth-client", () => ({
  authClient: { updateUser: mocks.updateUser },
}))

vi.mock("@/lib/auth/avatar", () => ({
  useUserAvatarUrl: (image: string | null) => image,
}))

vi.mock("@/components/avatar-upload-field", () => ({
  AvatarUploadField: () => <button type="button">Upload avatar</button>,
}))

vi.mock("@chatbotx.io/ui/components/ui/button", () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props} type={props.type ?? "button"}>
      {children}
    </button>
  ),
}))

const USER = {
  email: "jane@example.test",
  image: null,
  name: "Jane Doe",
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  vi.clearAllMocks()
  mocks.updateUser.mockResolvedValue({ error: null })
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const render = () => {
  act(() => root.render(<ProfileForm user={USER} />))
}

const saveButton = () =>
  Array.from(container.querySelectorAll("button")).find((button) =>
    button.textContent?.includes("actions.save"),
  )

const nameInput = () => {
  const input = container.querySelector<HTMLInputElement>('input[name="name"]')

  if (!input) {
    throw new Error("Profile name input is missing")
  }

  return input
}

const setInputValue = async (input: HTMLInputElement, value: string) => {
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set

  await act(async () => {
    valueSetter?.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
    await Promise.resolve()
  })
}

describe("ProfileForm", () => {
  it("keeps save disabled until the profile changes", async () => {
    render()

    expect(saveButton()?.disabled).toBe(true)

    await setInputValue(nameInput(), "Janet Doe")

    expect(saveButton()?.disabled).toBe(false)
  })

  it("saves the trimmed name", async () => {
    render()
    await setInputValue(nameInput(), "  Janet Doe  ")

    await act(async () => {
      saveButton()?.click()
      await Promise.resolve()
    })

    await vi.waitFor(() => {
      expect(mocks.updateUser).toHaveBeenCalledWith({
        image: null,
        name: "Janet Doe",
      })
    })
  })

  it("shows the update error", async () => {
    mocks.updateUser.mockResolvedValue({ error: { message: "Update failed" } })
    render()
    await setInputValue(nameInput(), "Janet Doe")

    await act(async () => {
      saveButton()?.click()
      await Promise.resolve()
    })

    await vi.waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith("Update failed")
    })
  })

  it("renders email as read-only", () => {
    render()

    expect(
      container.querySelector<HTMLInputElement>('input[name="email"]')
        ?.readOnly,
    ).toBe(true)
  })
})
