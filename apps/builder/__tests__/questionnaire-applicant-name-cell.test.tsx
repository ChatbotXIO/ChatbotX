import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { QuestionnaireApplicantNameCell } from "../src/features/questionnaires/components/questionnaire-applicant-name-cell"

vi.mock("@chatbotx.io/ui/components/ui/avatar", () => ({
  Avatar: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AvatarFallback: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  AvatarImage: ({ src }: { src?: string }) => (
    <span data-src={src} data-testid="avatar-image" />
  ),
}))

vi.mock("@chatbotx.io/ui/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  TooltipTrigger: ({ render }: { render: ReactNode }) => render,
}))

vi.mock("@/features/tenant", () => ({
  useTenantSettings: () => ({
    storageUrl: "https://cdn.example.com/chatbotx",
  }),
}))

describe("QuestionnaireApplicantNameCell", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
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

  test("converts storage avatars and preserves absolute URLs", () => {
    act(() => {
      root.render(
        <QuestionnaireApplicantNameCell
          contact={{
            avatar: "public/space/workspace-1/contacts/contact-1/avatar.png",
            fullName: "Jane Doe",
          }}
          conversationId="conversation-1"
          unknownContactLabel="Unknown contact"
          workspaceId="workspace-1"
        />,
      )
    })

    expect(
      container.querySelector<HTMLElement>("[data-testid='avatar-image']")
        ?.dataset.src,
    ).toBe(
      "https://cdn.example.com/chatbotx/public/space/workspace-1/contacts/contact-1/avatar.png",
    )

    const link = container.querySelector("a")
    expect(link?.getAttribute("href")).toBe(
      "/space/workspace-1/inbox?conversationId=conversation-1",
    )
    expect(link?.getAttribute("target")).toBe("_blank")

    act(() => {
      root.render(
        <QuestionnaireApplicantNameCell
          contact={{
            avatar: "https://images.example.com/avatar.png",
            fullName: "Jane Doe",
          }}
          unknownContactLabel="Unknown contact"
          workspaceId="workspace-1"
        />,
      )
    })

    expect(
      container.querySelector<HTMLElement>("[data-testid='avatar-image']")
        ?.dataset.src,
    ).toBe("https://images.example.com/avatar.png")
  })
})
