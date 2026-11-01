// @vitest-environment jsdom
import {
  type ButtonStepProps,
  buttonTypes,
  callPhoneNumberStepDefaultFn,
  openWebsiteStepDefaultFn,
} from "@chatbotx.io/flow-config"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { ButtonStepViewer } from "../viewer"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
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

const renderButton = (data: ButtonStepProps) => {
  act(() => {
    root.render(<ButtonStepViewer data={data} />)
  })
}

const callIcon = () =>
  container.querySelector('[data-testid="call-button-icon"]')

describe("ButtonStepViewer", () => {
  test("marks a call button with a phone icon next to its label", () => {
    renderButton({
      id: "1",
      label: "Call us",
      buttonType: buttonTypes.enum.callPhoneNumber,
      beforeStep: {
        ...callPhoneNumberStepDefaultFn(),
        phoneNumber: "+14155552671",
      },
      steps: [],
    })

    expect(callIcon()?.getAttribute("aria-hidden")).toBe("true")
    expect(container.querySelector("button")?.textContent).toBe("Call us")
  })

  test("shows no phone icon on other buttons", () => {
    renderButton({
      id: "2",
      label: "Visit site",
      buttonType: buttonTypes.enum.openWebsite,
      beforeStep: {
        ...openWebsiteStepDefaultFn(),
        url: "https://example.com",
      },
      steps: [],
    })

    expect(callIcon()).toBeNull()
  })
})
