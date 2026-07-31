// @vitest-environment jsdom
import {
  buttonStepDefaultFn,
  buttonTypes,
  openWebsiteStepDefaultFn,
  sendCardStepDefaultFn,
  sendCarouselStepDefaultFn,
} from "@chatbotx.io/flow-config"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import SendCarouselStepViewer from "../viewer"

const mocks = vi.hoisted(() => ({
  updateNodeInternals: vi.fn(),
}))

vi.mock("@xyflow/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@xyflow/react")>()),
  useUpdateNodeInternals: () => mocks.updateNodeInternals,
}))

vi.mock("@/components/base-handle", () => ({
  BaseHandle: ({ id }: { id?: string | null }) => (
    <span data-handleid={id ?? ""} />
  ),
}))

const HORIZONTAL_MARGIN_CLASS = /\bm[slrxe]-\d/
const FIRST_CARD_FRAME_OFFSET = "me-4"

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  mocks.updateNodeInternals.mockReset()
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  container.remove()
})

const render = (ui: React.ReactElement) => {
  act(() => {
    root.render(ui)
  })
}

const makeCarousel = (cardCount: number) => ({
  ...sendCarouselStepDefaultFn(),
  cards: Array.from({ length: cardCount }, (_, index) => ({
    ...sendCardStepDefaultFn(),
    id: `card-${index}`,
    title: `Title ${index}`,
    subtitle: `Subtitle ${index}`,
    image: undefined,
    buttons: [
      {
        ...buttonStepDefaultFn({ label: `Button ${index}` }),
        id: `button-${index}`,
      },
    ],
  })),
})

describe("SendCarouselStepViewer", () => {
  test.each([
    0, 1, 3, 10, 12,
  ])("renders all cards and handles for a %i-card carousel", (cardCount) => {
    render(
      <SendCarouselStepViewer data={makeCarousel(cardCount)} nodeId="node-1" />,
    )

    expect(container.querySelectorAll("[data-carousel-card-id]")).toHaveLength(
      cardCount,
    )
    expect(container.querySelectorAll("[data-handleid]")).toHaveLength(
      cardCount,
    )
    for (let index = 0; index < cardCount; index += 1) {
      expect(container.textContent).toContain(`Title ${index}`)
      expect(container.textContent).toContain(`Subtitle ${index}`)
      expect(container.textContent).toContain(`Button ${index}`)
      expect(
        container.querySelector(`[data-handleid="button-${index}"]`),
      ).not.toBeNull()
    }
  })

  test("uses a fixed 256px card width without clipping or disabling interaction", () => {
    render(<SendCarouselStepViewer data={makeCarousel(3)} nodeId="node-1" />)

    const row = container.querySelector('[data-slot="send-carousel-cards"]')
    expect(row?.className).toContain("w-max")
    expect(row?.className).not.toContain("pointer-events-none")
    for (const card of Array.from(
      container.querySelectorAll("[data-carousel-card-id]"),
    )) {
      expect(card.className).toContain("w-64")
      expect(card.className).toContain("shrink-0")
    }
  })

  test("offsets only the first card so the gutter stays even past the node frame", () => {
    render(<SendCarouselStepViewer data={makeCarousel(3)} nodeId="node-1" />)

    const row = container.querySelector('[data-slot="send-carousel-cards"]')
    expect(row?.className).toContain("gap-3")

    const cards = Array.from(
      container.querySelectorAll("[data-carousel-card-id]"),
    )
    expect(cards[0].className).toContain(FIRST_CARD_FRAME_OFFSET)
    for (const card of cards.slice(1)) {
      expect(card.className).not.toMatch(HORIZONTAL_MARGIN_CLASS)
    }
  })

  test("does not render a route handle for an external URL button", () => {
    const internalButton = {
      ...buttonStepDefaultFn({ label: "Internal" }),
      id: "internal",
    }
    const externalButton = {
      id: "external",
      label: "External",
      buttonType: buttonTypes.enum.openWebsite,
      beforeStep: {
        ...openWebsiteStepDefaultFn(),
        url: "https://example.com",
      },
      steps: [],
    }
    const data = {
      ...makeCarousel(1),
      cards: [
        {
          ...sendCardStepDefaultFn(),
          id: "card",
          title: "Card",
          buttons: [internalButton, externalButton],
        },
      ],
    }

    render(<SendCarouselStepViewer data={data} nodeId="node-1" />)

    expect(container.querySelector('[data-handleid="internal"]')).not.toBeNull()
    expect(container.querySelector('[data-handleid="external"]')).toBeNull()
  })

  test("renders cards without images or buttons", () => {
    const data = {
      ...makeCarousel(1),
      cards: [
        {
          ...sendCardStepDefaultFn(),
          id: "empty-card",
          title: "No media",
          image: undefined,
          buttons: [],
        },
      ],
    }

    expect(() =>
      render(<SendCarouselStepViewer data={data} nodeId="node-1" />),
    ).not.toThrow()
    expect(container.textContent).toContain("No media")
    expect(container.querySelector("[data-handleid]")).toBeNull()
  })

  test("refreshes node internals only when node id or cards reference changes", () => {
    const data = makeCarousel(1)
    render(<SendCarouselStepViewer data={data} nodeId="node-1" />)
    expect(mocks.updateNodeInternals).toHaveBeenCalledTimes(1)
    expect(mocks.updateNodeInternals).toHaveBeenLastCalledWith("node-1")

    render(<SendCarouselStepViewer data={{ ...data }} nodeId="node-1" />)
    expect(mocks.updateNodeInternals).toHaveBeenCalledTimes(1)

    render(
      <SendCarouselStepViewer
        data={{ ...data, cards: [...data.cards] }}
        nodeId="node-1"
      />,
    )
    expect(mocks.updateNodeInternals).toHaveBeenCalledTimes(2)

    render(
      <SendCarouselStepViewer
        data={{ ...data, cards: [...data.cards] }}
        nodeId="node-2"
      />,
    )
    expect(mocks.updateNodeInternals).toHaveBeenCalledTimes(3)
    expect(mocks.updateNodeInternals).toHaveBeenLastCalledWith("node-2")

    render(
      <SendCarouselStepViewer data={{ ...data, cards: [] }} nodeId="node-2" />,
    )
    expect(mocks.updateNodeInternals).toHaveBeenCalledTimes(4)
    expect(
      container.querySelector('[data-slot="send-carousel-cards"]'),
    ).toBeNull()
  })

  test("does not update node internals when rendered without a node id", () => {
    expect(() =>
      render(<SendCarouselStepViewer data={makeCarousel(1)} />),
    ).not.toThrow()
    expect(mocks.updateNodeInternals).not.toHaveBeenCalled()
  })
})
