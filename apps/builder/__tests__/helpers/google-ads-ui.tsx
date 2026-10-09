import type { ReactElement, ReactNode } from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"

/** Returns the key (plus any ICU values) so assertions read translation keys. */
export const translate = (key: string, values?: Record<string, unknown>) =>
  values ? `${key}:${Object.values(values).join(",")}` : key

export const nextIntlMock = () => ({
  useTranslations: () => translate,
  useFormatter: () => ({
    dateTime: (date: Date) => `date:${date.toISOString()}`,
    relativeTime: (date: Date) => `ago:${date.toISOString()}`,
  }),
})

/** Minimal stand-in for the base-ui Select: a native <select> over the items. */
export const selectMock = () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string
    onValueChange: (value: string) => void
    children: ReactNode
  }) => (
    <select
      data-testid="select"
      onChange={(event) => onValueChange(event.target.value)}
      value={value}
    >
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => (
    <option value={value}>{children}</option>
  ),
})

export type Mounted = {
  container: HTMLDivElement
  render: (element: ReactElement) => void
  unmount: () => void
}

export const mount = (): Mounted => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  return {
    container,
    render: (element) => {
      act(() => root.render(element))
    },
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

export const click = (element: Element | null | undefined) => {
  if (!element) {
    throw new Error("click target not found")
  }
  act(() => {
    ;(element as HTMLElement).click()
  })
}

export const buttonByText = (root: ParentNode, text: string) =>
  Array.from(root.querySelectorAll("button")).find((button) =>
    button.textContent?.includes(text),
  )
