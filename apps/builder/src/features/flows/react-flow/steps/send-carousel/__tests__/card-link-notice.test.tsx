// @vitest-environment jsdom
import {
  type ButtonStepProps,
  buttonStepDefaultFn,
  buttonTypes,
  openWebsiteStepDefaultFn,
} from "@chatbotx.io/flow-config"
import { act, type ReactElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { FormProvider, type UseFormReturn, useForm } from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { CarouselCardLinkNotice } from "../card-link-notice"

const NOTICE_TEXT = "On WhatsApp, this card's link won't work"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) =>
    key === "flows.sendCarousel.whatsappLinkButtonIgnored" ? NOTICE_TEXT : key,
}))

const replyButton = (label: string) => buttonStepDefaultFn({ label })

const linkButton = (label: string): ButtonStepProps => ({
  ...buttonStepDefaultFn({ label }),
  buttonType: buttonTypes.enum.openWebsite,
  beforeStep: { ...openWebsiteStepDefaultFn(), url: "https://example.com" },
})

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const render = (element: ReactElement) => {
  act(() => {
    root.render(element)
  })
}

let formApi: UseFormReturn | undefined

/** Mirrors the node-details form the carousel editor lives inside. */
const Harness = ({
  channel,
  buttons,
}: {
  channel: string
  buttons: ButtonStepProps[]
}) => {
  const form = useForm({
    defaultValues: {
      beforeStep: { channel },
      steps: [{ cards: [{ buttons }] }],
    },
  })
  formApi = form as unknown as UseFormReturn

  return (
    <FormProvider {...form}>
      <CarouselCardLinkNotice cardName="steps.0.cards.0" />
    </FormProvider>
  )
}

const noticeText = () =>
  container.querySelector('[data-slot="carousel-card-link-notice"]')
    ?.textContent

describe("CarouselCardLinkNotice", () => {
  test("warns on an omnichannel node whose card mixes a link with a reply", () => {
    render(
      <Harness
        buttons={[linkButton("Open"), replyButton("Yes")]}
        channel="omnichannel"
      />,
    )

    expect(noticeText()).toContain(NOTICE_TEXT)
  })

  test("stays silent when the card's link button is alone", () => {
    render(<Harness buttons={[linkButton("Open")]} channel="omnichannel" />)

    expect(noticeText()).toBeUndefined()
  })

  // The notice has to follow the card as it is edited; reading the form once
  // would leave it stale for the whole session.
  test("appears when a reply is added next to a lone link button", () => {
    render(<Harness buttons={[linkButton("Open")]} channel="omnichannel" />)
    expect(noticeText()).toBeUndefined()

    act(() => {
      formApi?.setValue("steps.0.cards.0.buttons", [
        linkButton("Open"),
        replyButton("Yes"),
      ])
    })

    expect(noticeText()).toContain(NOTICE_TEXT)
  })

  test("stays silent on a node that cannot reach WhatsApp", () => {
    render(
      <Harness
        buttons={[linkButton("Open"), replyButton("Yes")]}
        channel="messenger"
      />,
    )

    expect(noticeText()).toBeUndefined()
  })
})
