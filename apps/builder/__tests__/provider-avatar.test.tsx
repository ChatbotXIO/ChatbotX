// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import {
  PROVIDER_ICON_CONFIG,
  ProviderAvatar,
} from "@/features/social-accounts/components/provider-avatar"

const PROVIDERS = ["facebook", "instagram", "threads", "tiktok"] as const

describe("ProviderAvatar", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })
  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  test.each(
    PROVIDERS,
  )("shows the %s brand icon, not a person icon, when there is no picture", (provider) => {
    act(() => root.render(<ProviderAvatar avatar={null} provider={provider} />))

    expect(container.querySelector("img")).toBeNull()
    expect(container.querySelector("svg")).not.toBeNull()
    expect(container.querySelector("svg.lucide-user-round")).toBeNull()
  })

  test("has a brand icon for every network", () => {
    expect(Object.keys(PROVIDER_ICON_CONFIG).sort()).toEqual([
      "facebook",
      "instagram",
      "threads",
      "tiktok",
    ])
  })

  test("keeps the brand icon as the fallback until the picture loads", () => {
    act(() =>
      root.render(
        <ProviderAvatar
          avatar="https://cdn.example.com/a.jpg"
          provider="facebook"
        />,
      ),
    )

    // jsdom never loads the image, so the fallback stays rendered.
    expect(container.querySelector("svg")).not.toBeNull()
  })
})
