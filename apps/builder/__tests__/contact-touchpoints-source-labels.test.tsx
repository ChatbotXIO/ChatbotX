// @vitest-environment jsdom

/**
 * B12: every `contactSources` value renders its translated label (en and vi);
 * a value with no label falls back to the raw string.
 */

import { contactSources } from "@chatbotx.io/database/partials"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { ContactTouchpointsList } from "@/features/contacts/components/contact-touchpoints-list"
import type { ContactTouchpointResource } from "@/features/contacts/schema/touchpoint"
import en from "../messages/en.json"
import vi_ from "../messages/vi.json"

const state = vi.hoisted(() => ({
  messages: {} as Record<string, unknown>,
  list: vi.fn(),
}))

const lookup = (key: string): string | undefined => {
  let node: unknown = state.messages
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) {
      return
    }
    node = (node as Record<string, unknown>)[part]
  }
  return typeof node === "string" ? node : undefined
}

vi.mock("next-intl", () => {
  const translate = (key: string) => lookup(key) ?? key
  return {
    useTranslations: () =>
      Object.assign(translate, {
        has: (key: string) => lookup(key) !== undefined,
      }),
    useFormatter: () => ({ dateTime: () => "date" }),
  }
})

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

vi.mock("@/features/inboxes/lib/channel-label", () => ({
  channelLabel: (channel: string) => `label:${channel}`,
}))

vi.mock("@/features/tools/tools-list", () => ({ TOOLS_CONFIG: [] }))

vi.mock("@/lib/orpc/orpc", () => ({
  client: {
    contactsAPIs: { listContactTouchpointsAuthenticatedAPI: state.list },
  },
}))

const row = (source: string, key: number): ContactTouchpointResource =>
  ({
    kind: "inboxSource",
    resourceKey: String(key),
    resourceName: `Inbox ${key}`,
    occurredAt: new Date("2026-10-20T08:00:00.000Z"),
    channel: "instagram",
    inboxId: "1",
    details: { source },
  }) as ContactTouchpointResource

describe("inbox source labels", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    state.list.mockReset()
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

  const renderRows = async (
    sources: string[],
    resourceName?: (key: number) => string,
  ) => {
    state.list.mockResolvedValue({
      data: sources.map((source, index) => ({
        ...row(source, index + 1),
        ...(resourceName ? { resourceName: resourceName(index + 1) } : {}),
      })),
      nextCursor: null,
    })
    act(() => {
      root.render(
        <QueryClientProvider
          client={
            new QueryClient({ defaultOptions: { queries: { retry: false } } })
          }
        >
          <ContactTouchpointsList contactId="c-1" workspaceId="ws-1" />
        </QueryClientProvider>,
      )
    })
    await vi.waitFor(() =>
      expect(
        container.querySelector('[data-testid="touchpoint-resource-name"]'),
      ).not.toBeNull(),
    )
  }

  test("a long unbroken resource name cannot widen the row or the list", async () => {
    state.messages = en as unknown as Record<string, unknown>

    await renderRows(["ctwa"], () => "x".repeat(200))

    const name = container.querySelector(
      '[data-testid="touchpoint-resource-name"]',
    )
    expect(name?.className).toContain("truncate")
    expect(name?.getAttribute("title")).toBe("x".repeat(200))
    // Each ancestor up to the list must be allowed to shrink below its content.
    expect(name?.parentElement?.className).toContain("min-w-0")
    expect(name?.parentElement?.parentElement?.className).toContain("min-w-0")
    expect(container.firstElementChild?.className).toContain(
      "grid-cols-[minmax(0,1fr)]",
    )
  })

  const locales = [
    ["en", en],
    ["vi", vi_],
  ] as const

  describe.each(locales)("%s", (_locale, messages) => {
    test.each(
      contactSources.options,
    )("source %s renders its translated label", async (source) => {
      state.messages = messages as unknown as Record<string, unknown>
      const expected = (
        messages as unknown as {
          condition: { sources: Record<string, string> }
        }
      ).condition.sources[source]
      expect(expected, `missing condition.sources.${source}`).toBeTruthy()

      await renderRows([source])

      expect(container.textContent).toContain(expected)
      expect(container.textContent).not.toContain(`condition.sources.${source}`)
    })

    test("a source with no label falls back to the raw value", async () => {
      state.messages = messages as unknown as Record<string, unknown>

      await renderRows(["somethingNew"])

      expect(container.textContent).toContain("somethingNew")
      expect(container.textContent).not.toContain("condition.sources.")
    })
  })
})
