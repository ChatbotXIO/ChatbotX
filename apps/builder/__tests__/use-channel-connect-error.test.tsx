// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const mockReplace = vi.fn()
const toastError = vi.fn()

// The `channels` namespace as the locale files actually populate it:
// `duplicated` carries a line per channel, `missingScopes` only TikTok.
const MESSAGES: Record<string, string> = {
  "duplicated.generic": "Already connected elsewhere.",
  "duplicated.telegram": "This Telegram bot is already connected.",
  "duplicated.tiktok": "This TikTok account is already connected.",
  "missingScopes.generic": "Some permissions were not granted.",
  "missingScopes.tiktok": "TikTok connection cancelled: permissions missing.",
}

let currentSearchParams = new URLSearchParams()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => currentSearchParams,
}))

vi.mock("next-intl", () => ({
  useTranslations: () => {
    const t = (key: string) => MESSAGES[key] ?? `MISSING:${key}`
    t.has = (key: string) => key in MESSAGES
    return t
  },
}))

vi.mock("sonner", () => ({ toast: { error: toastError } }))

const { useChannelConnectError } = await import(
  "@/hooks/use-channel-connect-error"
)

function HookHost({ channel }: { channel?: string }) {
  useChannelConnectError(channel)
  return null
}

describe("useChannelConnectError", () => {
  let container: HTMLDivElement
  let root: Root

  const render = (search: string, channel?: string) => {
    currentSearchParams = new URLSearchParams(search)
    act(() => {
      root.render(<HookHost channel={channel} />)
    })
    act(() => {
      vi.runAllTimers()
    })
  }

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.useFakeTimers()
    mockReplace.mockClear()
    toastError.mockClear()
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.useRealTimers()
  })

  test("toasts the channel's own copy when it exists", () => {
    render("error=missingScopes", "tiktok")

    expect(toastError).toHaveBeenCalledWith(
      "TikTok connection cancelled: permissions missing.",
    )
  })

  // The reason the `t.has` guard exists: `missingScopes` has no per-channel
  // line for Telegram, and asking for one would render a raw key. Only TikTok
  // rejects a partial grant today, but the hook is wired into all 7 channel
  // settings pages, so an uneven namespace must degrade rather than break.
  test("falls back to the generic copy when the channel has no line", () => {
    render("error=missingScopes", "telegram")

    expect(toastError).toHaveBeenCalledWith(
      "Some permissions were not granted.",
    )
  })

  test("still resolves the per-channel copy for the duplicated code", () => {
    render("error=duplicated", "telegram")

    expect(toastError).toHaveBeenCalledWith(
      "This Telegram bot is already connected.",
    )
  })

  test("ignores an unrecognised error code", () => {
    render("error=somethingElse", "tiktok")

    expect(toastError).not.toHaveBeenCalled()
    expect(mockReplace).not.toHaveBeenCalled()
  })

  // The param is stripped so a refresh does not repeat the toast, while any
  // other query state the page relies on survives.
  test("strips only the error param", () => {
    render("error=missingScopes&channel=tiktok", "tiktok")

    expect(mockReplace).toHaveBeenCalledWith("/?channel=tiktok", {
      scroll: false,
    })
  })
})
