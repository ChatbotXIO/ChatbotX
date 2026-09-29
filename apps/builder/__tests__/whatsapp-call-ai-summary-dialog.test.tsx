// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("@/hooks/routing", () => ({
  useWorkspaceId: () => "ws-1",
}))

const { listCallSummaryProvidersActionMock, generateCallAiSummaryActionMock } =
  vi.hoisted(() => ({
    listCallSummaryProvidersActionMock: vi.fn(),
    generateCallAiSummaryActionMock: vi.fn(),
  }))

vi.mock(
  "@/features/messages/actions/list-call-summary-providers.action",
  () => ({
    listCallSummaryProvidersAction: listCallSummaryProvidersActionMock,
  }),
)

vi.mock("@/features/messages/actions/generate-call-ai-summary.action", () => ({
  generateCallAiSummaryAction: Object.assign(generateCallAiSummaryActionMock, {
    bind: () => generateCallAiSummaryActionMock,
  }),
}))

const { WhatsappCallAiSummaryDialog } = await import(
  "@/features/messages/components/whatsapp-call-ai-summary-dialog"
)

let container: HTMLDivElement | null = null
let root: Root | null = null
let queryClient: QueryClient

function renderComponent(props: {
  open: boolean
  hasTranscript: boolean
  onGenerated: (result: unknown) => void
  onOpenChange: (open: boolean) => void
}) {
  queryClient = new QueryClient()
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(
      <QueryClientProvider client={queryClient}>
        <WhatsappCallAiSummaryDialog whatsappCallId="call-1" {...props} />
      </QueryClientProvider>,
    )
  })
}

const flush = async () => {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

afterEach(() => {
  if (root) {
    act(() => root?.unmount())
  }
  container?.remove()
  container = null
  root = null
})

describe("WhatsappCallAiSummaryDialog", () => {
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.clearAllMocks()
  })

  test("lists the workspace's connected AI providers", async () => {
    listCallSummaryProvidersActionMock.mockResolvedValue({
      data: {
        providers: [
          { id: "int-1", provider: "openai", label: "OpenAI" },
          { id: "int-2", provider: "claude", label: "Claude" },
        ],
      },
    })

    renderComponent({
      open: true,
      hasTranscript: true,
      onGenerated: vi.fn(),
      onOpenChange: vi.fn(),
    })
    await flush()

    expect(document.body.textContent).toContain("OpenAI")
    expect(document.body.textContent).toContain("Claude")
  })

  test("shows a connect-an-AI-provider link when nothing is connected", async () => {
    listCallSummaryProvidersActionMock.mockResolvedValue({
      data: { providers: [] },
    })

    renderComponent({
      open: true,
      hasTranscript: true,
      onGenerated: vi.fn(),
      onOpenChange: vi.fn(),
    })
    await flush()

    expect(document.body.textContent).toContain("noProviderTitle")
    const link = document.body.querySelector("a")
    expect(link?.getAttribute("href")).toBe("/space/ws-1/settings/integrations")
  })

  test("clicking Generate calls generateCallAiSummaryAction with the selected provider", async () => {
    listCallSummaryProvidersActionMock.mockResolvedValue({
      data: {
        providers: [{ id: "int-1", provider: "openai", label: "OpenAI" }],
      },
    })
    generateCallAiSummaryActionMock.mockResolvedValue({
      data: { aiSummary: { summary: "Recap" } },
    })
    const onGenerated = vi.fn()

    renderComponent({
      open: true,
      hasTranscript: true,
      onGenerated,
      onOpenChange: vi.fn(),
    })
    await flush()

    const generateButton = Array.from(
      document.body.querySelectorAll("button"),
    ).find((button) => button.textContent === "generate")
    expect(generateButton).toBeDefined()

    await act(async () => {
      generateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(generateCallAiSummaryActionMock).toHaveBeenCalledWith({
      whatsappCallId: "call-1",
      provider: "openai",
    })
    expect(onGenerated).toHaveBeenCalledWith({ summary: "Recap" })
  })

  test("disables Generate with a tooltip when the transcript is empty", async () => {
    listCallSummaryProvidersActionMock.mockResolvedValue({
      data: {
        providers: [{ id: "int-1", provider: "openai", label: "OpenAI" }],
      },
    })

    renderComponent({
      open: true,
      hasTranscript: false,
      onGenerated: vi.fn(),
      onOpenChange: vi.fn(),
    })
    await flush()

    const generateButton = Array.from(
      document.body.querySelectorAll("button"),
    ).find((button) => button.textContent === "generate")
    expect(generateButton?.disabled).toBe(true)
    expect(generateCallAiSummaryActionMock).not.toHaveBeenCalled()
  })
})
