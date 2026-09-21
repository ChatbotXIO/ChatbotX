import { broadcastSubactions } from "@chatbotx.io/database/partials"
import { stepTypes } from "@chatbotx.io/flow-config"
import { describe, expect, test, vi } from "vitest"

vi.mock("@/features/broadcasts/actions/create-broadcast.action", () => ({
  createBroadcastAction: vi.fn(),
}))
vi.mock("@/features/broadcasts/actions/update-draft-broadcast.action", () => ({
  updateDraftBroadcastAction: vi.fn(),
}))
vi.mock(
  "@/features/broadcasts/components/broadcast-audience-preview-dialog",
  () => ({
    BroadcastAudiencePreviewDialog: () => null,
  }),
)
vi.mock("@/features/broadcasts/components/broadcast-confirm-dialog", () => ({
  BroadcastConfirmDialog: () => null,
}))
vi.mock("@/features/broadcasts/components/broadcast-flow-targets", () => ({
  BroadcastFlowTargets: () => null,
}))
vi.mock(
  "@/features/broadcasts/components/broadcast-flow-type-selector",
  () => ({
    BroadcastFlowTypeSelector: () => null,
  }),
)
vi.mock(
  "@/features/broadcasts/components/broadcast-inbox-multi-select",
  () => ({
    BroadcastInboxMultiSelect: () => null,
  }),
)
vi.mock("@/features/broadcasts/components/broadcast-template-targets", () => ({
  BroadcastTemplateTargets: () => null,
}))
vi.mock("@/features/contact-filter", () => ({
  ContactFilter: () => null,
}))
vi.mock("@/features/contacts/provider/contact-store-context", () => ({
  useContactStore: () => ({}),
}))
vi.mock("@/features/flows/provider/flow-hook", () => ({
  useFlows: () => ({ data: [] }),
}))
vi.mock("@/features/inboxes/components/inbox-icon", () => ({
  InboxIcon: () => null,
}))
vi.mock("@/features/inboxes/provider/inbox-hook", () => ({
  useInboxList: () => [],
}))
vi.mock("@/hooks/routing", () => ({
  useWorkspaceId: () => "workspace-1",
}))

import { buildBroadcastFlowFilter } from "@/features/broadcasts/create-broadcast-form"

describe("buildBroadcastFlowFilter", () => {
  test("scopes WhatsApp template broadcasts to their selected integrations", () => {
    expect(
      buildBroadcastFlowFilter(
        broadcastSubactions.enum.whatsappTemplateMessage,
        ["whatsapp-1", "whatsapp-2"],
      ),
    ).toEqual({
      startType: stepTypes.enum.sendWaTemplateMessage,
      integrationWhatsappIds: ["whatsapp-1", "whatsapp-2"],
    })
  })

  test("does not retain WhatsApp integrations after switching to Messenger", () => {
    expect(
      buildBroadcastFlowFilter(
        broadcastSubactions.enum.messengerTemplateMessage,
        ["whatsapp-1"],
      ),
    ).toEqual({ startType: stepTypes.enum.sendMessengerTemplateMessage })
  })

  test("does not filter ordinary broadcasts", () => {
    expect(
      buildBroadcastFlowFilter(broadcastSubactions.enum.allContacts, []),
    ).toEqual({})
  })
})
