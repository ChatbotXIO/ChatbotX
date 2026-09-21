// @vitest-environment jsdom
import type { MinigamePlayResult } from "@chatbotx.io/business/minigame"
import type { MinigameModel } from "@chatbotx.io/database/types"
import { act, type ComponentProps, type ReactElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { ResultDialog } from "../result-dialog"

vi.mock("@chatbotx.io/ui/components/ui/dialog", () => ({
  Dialog: ({ children }: ComponentProps<"div">) => <div>{children}</div>,
  DialogClose: ({ render }: { render: ReactElement }) => render,
  DialogContent: ({ children }: ComponentProps<"div">) => <div>{children}</div>,
  DialogDescription: ({ children }: ComponentProps<"p">) => (
    <p data-testid="dialog-description">{children}</p>
  ),
  DialogFooter: ({ children }: ComponentProps<"div">) => <div>{children}</div>,
  DialogHeader: ({ children }: ComponentProps<"div">) => <div>{children}</div>,
  DialogTitle: ({ children }: ComponentProps<"h2">) => (
    <h2 data-testid="dialog-title">{children}</h2>
  ),
}))

vi.mock("@chatbotx.io/ui/components/ui/button", () => ({
  Button: ({ children, ...props }: ComponentProps<"button">) => (
    <button {...props}>{children}</button>
  ),
}))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

const buildMinigame = (
  overrides: {
    winningTitle?: string
    winningDescription?: string
    loseTitle?: string
  } = {},
) =>
  ({
    prizeSettings: {
      nonWinning: {
        title: overrides.loseTitle ?? "Chúc bạn may mắn lần sau",
        loseImage: { url: "" },
      },
    },
    winningMessageSettings: {
      title: overrides.winningTitle ?? "",
      description: overrides.winningDescription ?? "",
      acceptButtonText: "",
    },
    nonWinningMessageSettings: { title: "", description: "" },
  }) as unknown as MinigameModel

const prizeResult = (name = "Áo thun") =>
  ({
    type: "prize",
    prize: { name, icon: { url: "" } },
  }) as unknown as MinigamePlayResult

let container: HTMLDivElement
let root: Root

const renderDialog = (element: ReactElement) => {
  act(() => {
    root.render(element)
  })
}

const textOf = (testId: string) =>
  container.querySelector(`[data-testid="${testId}"]`)?.textContent

beforeEach(() => {
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  container.remove()
  vi.restoreAllMocks()
})

describe("ResultDialog spintax", () => {
  test("spins the title and description, then substitutes the prize name", () => {
    vi.spyOn(Math, "random").mockReturnValue(0)

    renderDialog(
      <ResultDialog
        minigame={buildMinigame({
          winningTitle: "{Chúc mừng|Xin chúc mừng}!",
          winningDescription: "Bạn {trúng|nhận được} {{prize_name}}",
        })}
        onOpenChange={() => undefined}
        open
        result={prizeResult()}
      />,
    )

    expect(textOf("dialog-title")).toBe("Chúc mừng!")
    expect(textOf("dialog-description")).toBe("Bạn trúng Áo thun")
  })

  // The bug this guards: computing the copy inline re-rolled the branch on
  // every render, so the wording changed under the player while the dialog
  // animated open.
  test("keeps the same branch across re-renders of the same result", () => {
    // A re-roll would take the second branch, so a changed string is a failure.
    const random = vi.spyOn(Math, "random")
    random.mockReturnValueOnce(0).mockReturnValue(0.99)

    const minigame = buildMinigame({
      winningTitle: "{Chúc mừng|Xin chúc mừng}!",
    })
    const result = prizeResult()
    // A FRESH element each time, holding the same `result`/`minigame`
    // references. Re-rendering one identical element object lets React bail
    // out before the component body runs, which would make this pass even
    // without the memo.
    const element = () => (
      <ResultDialog
        minigame={minigame}
        onOpenChange={() => undefined}
        open
        result={result}
      />
    )

    renderDialog(element())
    const first = textOf("dialog-title")

    renderDialog(element())
    renderDialog(element())

    expect(first).toBe("Chúc mừng!")
    expect(textOf("dialog-title")).toBe(first)
  })

  test("never spins the prize name it substitutes", () => {
    vi.spyOn(Math, "random").mockReturnValue(0)

    renderDialog(
      <ResultDialog
        minigame={buildMinigame({ winningTitle: "Bạn trúng {{prize_name}}" })}
        onOpenChange={() => undefined}
        open
        result={prizeResult("Combo {áo|quần}")}
      />,
    )

    expect(textOf("dialog-title")).toBe("Bạn trúng Combo {áo|quần}")
  })

  test("renders nothing without a result", () => {
    renderDialog(
      <ResultDialog
        minigame={buildMinigame()}
        onOpenChange={() => undefined}
        open
        result={null}
      />,
    )

    expect(container.textContent).toBe("")
  })
})
