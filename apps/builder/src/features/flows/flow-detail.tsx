"use client"

import type {
  OrganizationModel,
  OrganizationSettings,
} from "@aha.chat/database/types"
import { ReactFlowProvider } from "@xyflow/react"
import { useEffect, useState } from "react"
import { AIToolsStoreProvider } from "../ai-triggers/provider/ai-tools-store-context"
import { CustomFieldStoreProvider } from "../custom-fields/provider/custom-field-store-context"
import type { FlowVersionResource } from "../flow-versions/schema/resource"
import { InboxStoreProvider } from "../inboxes/provider/inbox-store-context"
import { getTemplatesForFlow } from "../integration-whatsapp/message-templates/actions/get-templates-for-flow"
import { TagStoreProvider } from "../tags/provider/tag-store-context"
import { UserStoreProvider } from "../users/provider/user-store-context"
import { FlowStoreProvider } from "./provider/flow-store-context"
import { MenuDataProvider } from "./react-flow/contexts/menu-data-context"
import { ReactFlowFrame } from "./react-flow/frame"
import { StepStoreProvider } from "./react-flow/stores/step-store-provider"
import type { FlowResource } from "./schemas/resource"

type FlowDetailProps = {
  flow: FlowResource
  flowVersion: FlowVersionResource
  organization: OrganizationModel
}

export function FlowDetail({
  flow,
  flowVersion,
  organization,
}: FlowDetailProps) {
  const [waTemplates, setWaTemplates] = useState<
    Array<{ id: string; name: string; language: string }>
  >([])

  useEffect(() => {
    getTemplatesForFlow(flow.chatbotId)
      .then((data) =>
        setWaTemplates(
          data.map((t) => ({
            id: t.id,
            name: t.name,
            language: t.language,
          })),
        ),
      )
      .catch((error) => {
        console.error("Failed to fetch templates:", error)
      })
  }, [flow.chatbotId])

  return (
    <ReactFlowProvider>
      <StepStoreProvider
        initialState={{
          organizationSetings:
            organization.settings as unknown as OrganizationSettings,
          activeFlowId: flow.id,
        }}
      >
        <MenuDataProvider
          chatbotId={flow.chatbotId}
          data={{
            "wa.templates": waTemplates,
          }}
        >
          <InboxStoreProvider chatbotId={flow.chatbotId}>
            <FlowStoreProvider chatbotId={flow.chatbotId}>
              <TagStoreProvider chatbotId={flow.chatbotId}>
                <UserStoreProvider chatbotId={flow.chatbotId}>
                  <CustomFieldStoreProvider chatbotId={flow.chatbotId}>
                    <AIToolsStoreProvider chatbotId={flow.chatbotId}>
                      <ReactFlowFrame flow={flow} flowVersion={flowVersion} />
                    </AIToolsStoreProvider>
                  </CustomFieldStoreProvider>
                </UserStoreProvider>
              </TagStoreProvider>
            </FlowStoreProvider>
          </InboxStoreProvider>
        </MenuDataProvider>
      </StepStoreProvider>
    </ReactFlowProvider>
  )
}
