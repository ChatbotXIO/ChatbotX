// @vitest-environment jsdom

import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { LangSelector } from "@/components/lang-selector"

const navigation = vi.hoisted(() => ({
  refresh: vi.fn(),
}))

const localeAction = vi.hoisted(() => ({
  resolve: vi.fn() as () => void,
  setUserLocale: vi.fn(
    () =>
      new Promise<void>((resolve) => {
        localeAction.resolve = resolve
      }),
  ),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: navigation.refresh,
  }),
}))

vi.mock("next-intl", () => ({
  useLocale: () => "zh-TW",
  useTranslations: () => (key: string) => key,
}))

vi.mock("@/lib/locale", () => ({
  setUserLocale: localeAction.setUserLocale,
}))

vi.mock("@chatbotx.io/ui/components/ui/button", () => ({
  Button: ({
    children,
    disabled,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button disabled={disabled} {...props}>
      {children}
    </button>
  ),
}))

vi.mock("@chatbotx.io/ui/components/ui/popover", () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverContent: ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  PopoverTrigger: ({ render }: { render: ReactNode }) => <>{render}</>,
}))

vi.mock("@chatbotx.io/ui/components/ui/command", () => ({
  Command: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandEmpty: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  CommandInput: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
  CommandList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandItem: ({
    children,
    disabled,
    onSelect,
    value,
  }: {
    children: ReactNode
    disabled?: boolean
    onSelect?: () => void
    value: string
  }) => (
    <button
      aria-label={value}
      data-disabled={disabled ? "true" : "false"}
      disabled={disabled}
      onClick={() => onSelect?.()}
      type="button"
    >
      {children}
    </button>
  ),
}))

describe("LangSelector", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    navigation.refresh.mockClear()
    localeAction.setUserLocale.mockClear()
    localeAction.resolve = vi.fn()
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)

    act(() => {
      root.render(<LangSelector />)
    })
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  test("refreshes after the locale cookie write resolves", async () => {
    const option = container.querySelector<HTMLButtonElement>(
      'button[aria-label="简体中文"]',
    )

    if (!option) {
      throw new Error("simplified chinese option not rendered")
    }

    act(() => {
      option.click()
    })

    expect(localeAction.setUserLocale).toHaveBeenCalledWith("zh-CN")
    expect(navigation.refresh).not.toHaveBeenCalled()

    await act(() => {
      localeAction.resolve()
    })

    expect(navigation.refresh).toHaveBeenCalledTimes(1)
  })

  test("disables the selector while the locale change is pending", () => {
    const trigger = container.querySelector<HTMLButtonElement>(
      'button[role="combobox"]',
    )
    const option = container.querySelector<HTMLButtonElement>(
      'button[aria-label="简体中文"]',
    )

    if (!(trigger && option)) {
      throw new Error("lang selector controls not rendered")
    }

    expect(trigger.disabled).toBe(false)
    expect(option.disabled).toBe(false)

    act(() => {
      option.click()
    })

    expect(trigger.disabled).toBe(true)
    expect(option.disabled).toBe(true)
  })
})
