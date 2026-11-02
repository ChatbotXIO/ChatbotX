// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { AddCondition } from "@/features/triggers/add-condition"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  document.body.innerHTML = ""
})

const openMenu = () => {
  act(() => {
    root.render(<AddCondition onAdd={vi.fn()} />)
  })
  act(() => {
    container
      .querySelector("button")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
  })
}

const conditionKeys = (items: Element[]) =>
  items.map((item) =>
    (item.textContent ?? "").replace("trigger.conditions.", ""),
  )

describe("AddCondition order", () => {
  test("lists the triggers in the reference order, ChatbotX-only ones closing their group", () => {
    openMenu()

    const items = Array.from(document.querySelectorAll('[role="menuitem"]'))

    expect(conditionKeys(items)).toEqual([
      // Tags
      "tagApplied",
      "tagRemoved",
      // Custom Fields
      "customFieldValueChanged",
      "dateTimeBasedTrigger",
      // Unlabeled groups
      "conversationTransferredToHuman",
      "conversationTransferredToBot",
      "newContact",
      "contactUnsubscribedFormBroadcast",
      "archived",
      "followUp",
      "conversationAssigned",
      "conversationUnassigned",
      "contactInfoUpdated",
      // WhatsApp
      "incomingCall",
      "missedAudioCall",
      "callEnded",
      "callRecorded",
      "callTranscribed",
      // Pipelines
      "pipelineItemCreated",
      "pipelineItemMovedToStage",
      "pipelineItemValueChanged",
      "pipelineItemStatusChanged",
      "pipelineItemPriorityChanged",
      // Sequences
      "subscribedToSequence",
      "unsubscribedFromSequence",
      // Ecommerce
      "shoppingCartSent",
      "userAskedAboutProduct",
      "cartAbandoned",
      "newOrder",
      "orderAccepted",
      "orderShipped",
      "orderConcluded",
      "orderCancelled",
      "categoryAddedToCart",
      "productAddedToCart",
      "productRemovedFromCart",
      "productOrdered",
      "orderPaid",
      "orderRefunded",
      // Entry point links
      "contactReferredANewContact",
      "contactReferredExistingContact",
    ])
  })

  test("only the groups that have a name show a heading", () => {
    openMenu()

    const headings = Array.from(
      document.querySelectorAll('[role="menu"] [class*="text-xs"]'),
    ).map((heading) => heading.textContent)

    expect(headings).toEqual([
      "fields.tags.label",
      "fields.customFields.label",
      "fields.whatsapp.label",
      "fields.pipelines.label",
      "fields.sequences.label",
      "fields.ecommerce.label",
      "fields.entryPointLink.label",
    ])
  })
})
