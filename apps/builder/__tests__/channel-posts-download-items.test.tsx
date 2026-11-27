// @vitest-environment jsdom

import type { ReactNode } from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, test, vi } from "vitest"
import { PostDownloadItems } from "@/features/channel-posts/components/post-download-items"
import {
  CHANNEL_EXPORT_FAILURE_MESSAGE_KEYS,
  canReadCommentsFromChannel,
  channelExportStartErrorKey,
} from "@/features/channel-posts/lib/channel-export"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

// The menu primitives are plain elements here: the test is about which items
// the post offers and what each one starts, not about the popup behaviour.
vi.mock("@chatbotx.io/ui/components/ui/dropdown-menu", () => ({
  DropdownMenuItem: ({
    children,
    disabled,
    onClick,
  }: {
    children: ReactNode
    disabled?: boolean
    onClick?: () => void
  }) => (
    <button data-item="" disabled={disabled} onClick={onClick} type="button">
      {children}
    </button>
  ),
  DropdownMenuSub: ({ children }: { children: ReactNode }) => (
    <section data-sub="">{children}</section>
  ),
  DropdownMenuSubContent: ({ children }: { children: ReactNode }) => (
    <div data-sub-content="">{children}</div>
  ),
  DropdownMenuSubTrigger: ({ children }: { children: ReactNode }) => (
    <span data-sub-trigger="">{children}</span>
  ),
}))

type Props = Parameters<typeof PostDownloadItems>[0]

let root: Root | undefined
let container: HTMLDivElement | undefined

const download = vi.fn()
const startChannelExport = vi.fn()

const render = (overrides: Partial<Props> = {}) => {
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  const props: Props = {
    canViewContactData: true,
    channelExport: { isBusy: false, start: startChannelExport },
    post: { channel: "messenger", id: "42" } as Props["post"],
    readOnly: false,
    storedExport: { download, isDownloading: false },
    ...overrides,
  }
  act(() => {
    root?.render(<PostDownloadItems {...props} />)
  })
  return container
}

const buttons = (view: HTMLElement) =>
  Array.from(view.querySelectorAll<HTMLButtonElement>("[data-item]"))

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
  vi.clearAllMocks()
})

describe("PostDownloadItems", () => {
  test("a readable channel offers comments, phones and emails, each with both sources", () => {
    const view = render()

    const triggers = Array.from(
      view.querySelectorAll("[data-sub-trigger]"),
    ).map((node) => node.textContent)
    expect(triggers).toEqual([
      "posts.actions.downloadComments",
      "posts.actions.downloadPhones",
      "posts.actions.downloadEmails",
    ])
    for (const sub of Array.from(view.querySelectorAll("[data-sub-content]"))) {
      expect(
        Array.from(sub.querySelectorAll("[data-item]")).map(
          (n) => n.textContent,
        ),
      ).toEqual(["posts.export.sourceStored", "posts.export.sourceChannel"])
    }
  })

  test("a member without contact-data permission sees only the comments", () => {
    const view = render({ canViewContactData: false })

    expect(
      Array.from(view.querySelectorAll("[data-sub-trigger]")).map(
        (node) => node.textContent,
      ),
    ).toEqual(["posts.actions.downloadComments"])
  })

  test("each source starts its own download for the post", () => {
    const view = render()
    const [storedComments, channelComments, , channelPhones, , channelEmails] =
      buttons(view)

    act(() => storedComments.click())
    act(() => channelComments.click())
    act(() => channelPhones.click())
    act(() => channelEmails.click())

    expect(download).toHaveBeenCalledExactlyOnceWith("comments", ["42"])
    expect(startChannelExport.mock.calls).toEqual([
      ["comments", ["42"]],
      ["phones", ["42"]],
      ["emails", ["42"]],
    ])
  })

  test("a channel that cannot be read offers the stored download only, as plain items", () => {
    const view = render({
      post: { channel: "whatsapp", id: "7" } as Props["post"],
    })

    expect(view.querySelector("[data-sub]")).toBeNull()
    expect(buttons(view).map((button) => button.textContent)).toEqual([
      "posts.actions.downloadComments",
      "posts.actions.downloadPhones",
      "posts.actions.downloadEmails",
    ])
    act(() => buttons(view)[2].click())
    expect(download).toHaveBeenCalledWith("emails", ["7"])
    expect(startChannelExport).not.toHaveBeenCalled()
  })

  test("an expired workspace disables every source", () => {
    const view = render({ readOnly: true })

    expect(buttons(view).every((button) => button.disabled)).toBe(true)
  })

  test("a running channel export disables only the channel source", () => {
    const view = render({
      channelExport: { isBusy: true, start: startChannelExport },
    })

    const disabledLabels = buttons(view).map(
      (button) => [button.textContent, button.disabled] as const,
    )
    expect(disabledLabels).toEqual([
      ["posts.export.sourceStored", false],
      ["posts.export.sourceChannel", true],
      ["posts.export.sourceStored", false],
      ["posts.export.sourceChannel", true],
      ["posts.export.sourceStored", false],
      ["posts.export.sourceChannel", true],
    ])
  })

  test("a stored download in progress disables the stored source", () => {
    const view = render({ storedExport: { download, isDownloading: true } })

    expect(buttons(view).map((button) => button.disabled)).toEqual([
      true,
      false,
      true,
      false,
      true,
      false,
    ])
  })
})

describe("channel export helpers", () => {
  test("only a channel the server can read for comments is offered the source", () => {
    expect(canReadCommentsFromChannel("messenger")).toBe(true)
    expect(canReadCommentsFromChannel("tiktok")).toBe(true)
    expect(canReadCommentsFromChannel("whatsapp")).toBe(false)
  })

  test("every failure reason has its own message", () => {
    expect(Object.keys(CHANNEL_EXPORT_FAILURE_MESSAGE_KEYS).sort()).toEqual([
      "channelDisconnected",
      "failed",
      "notSupported",
      "postNotFound",
      "rateLimited",
    ])
    expect(
      new Set(Object.values(CHANNEL_EXPORT_FAILURE_MESSAGE_KEYS)).size,
    ).toBe(5)
  })

  test.each([
    ["commentExportUnsupported", "posts.channelExport.failure.notSupported"],
    ["postMessageQuotaExceeded", "posts.export.quotaExceeded"],
    ["workspaceBlocked", "posts.export.blocked"],
    ["trialExpired", "posts.export.blocked"],
    ["FORBIDDEN", "posts.channelExport.forbidden"],
    ["exportInProgress", "posts.channelExport.inProgress"],
  ])("a refused start with code %s says why", (code, key) => {
    expect(channelExportStartErrorKey({ code })).toBe(key)
  })

  test("any other error is a generic failure to start", () => {
    expect(channelExportStartErrorKey({ code: "INTERNAL_SERVER_ERROR" })).toBe(
      "posts.channelExport.startFailed",
    )
    expect(channelExportStartErrorKey(new Error("offline"))).toBe(
      "posts.channelExport.startFailed",
    )
    expect(channelExportStartErrorKey(undefined)).toBe(
      "posts.channelExport.startFailed",
    )
  })
})
