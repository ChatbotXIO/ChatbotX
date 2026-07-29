import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { QuestionnaireApplicantAvatarCell } from "../src/features/questionnaires/components/questionnaire-applicant-avatar-cell"

vi.mock("@chatbotx.io/ui/components/ui/avatar", () => ({
  Avatar: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AvatarFallback: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  AvatarImage: ({ src }: { src?: string }) => (
    <span data-src={src} data-testid="avatar-image" />
  ),
}))

vi.mock("@/features/tenant", () => ({
  useTenantSettings: () => ({
    storageUrl: "https://cdn.example.com/chatbotx",
  }),
}))

describe("QuestionnaireApplicantAvatarCell", () => {
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
    const onClick = vi.fn()

    act(() => {
      root.render(
        <QuestionnaireApplicantAvatarCell
          contact={{
            avatar: "public/space/workspace-1/contacts/contact-1/avatar.png",
            fullName: "Jane Doe",
          }}
          onClick={onClick}
          unknownContactLabel="Unknown contact"
        />,
      )
    })

    expect(
      container.querySelector<HTMLElement>("[data-testid='avatar-image']")
        ?.dataset.src,
    ).toBe(
      "https://cdn.example.com/chatbotx/public/space/workspace-1/contacts/contact-1/avatar.png",
    )

    const button = container.querySelector("button")
    expect(button).not.toBeNull()

    act(() => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(onClick).toHaveBeenCalledTimes(1)

    act(() => {
      root.render(
        <QuestionnaireApplicantAvatarCell
          contact={{
            avatar: "https://images.example.com/avatar.png",
            fullName: "Jane Doe",
          }}
          onClick={onClick}
          unknownContactLabel="Unknown contact"
        />,
      )
    })

    expect(
      container.querySelector<HTMLElement>("[data-testid='avatar-image']")
        ?.dataset.src,
    ).toBe("https://images.example.com/avatar.png")
  })
})
