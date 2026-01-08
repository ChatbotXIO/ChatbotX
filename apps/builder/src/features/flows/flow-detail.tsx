"use client"

import type {
  OrganizationModel,
  OrganizationSettings,
} from "@aha.chat/database/types"
import { ReactFlowProvider } from "@xyflow/react"
import { CustomFieldStoreProvider } from "../custom-fields/provider/custom-field-store-context"
import { InboxStoreProvider } from "../inboxes/provider/inbox-store-context"
import { TagStoreProvider } from "../tags/provider/tag-store-context"
import { UserStoreProvider } from "../users/provider/user-store-context"
import { FlowStoreProvider } from "./provider/flow-store-context"
import { ReactFlowFrame } from "./react-flow/frame"
import { StepStoreProvider } from "./react-flow/stores/step-store-provider"
import type { FlowResource, FlowVersionResource } from "./schemas/resource"

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
  return (
    <ReactFlowProvider>
      <StepStoreProvider
        initialState={{
          organizationSetings:
            organization.settings as unknown as OrganizationSettings,
          activeFlowId: flow.id,
        }}
      >
        <InboxStoreProvider autoInitialize={true} chatbotId={flow.chatbotId}>
          <FlowStoreProvider autoInitialize={true} chatbotId={flow.chatbotId}>
            <TagStoreProvider autoInitialize={true} chatbotId={flow.chatbotId}>
              <UserStoreProvider
                autoInitializeAgentsAndInboxTeams={true}
                chatbotId={flow.chatbotId}
              >
                <CustomFieldStoreProvider
                  autoInitialize={true}
                  chatbotId={flow.chatbotId}
                >
                  <ReactFlowFrame flow={flow} flowVersion={flowVersion} />
                </CustomFieldStoreProvider>
              </UserStoreProvider>
            </TagStoreProvider>
          </FlowStoreProvider>
        </InboxStoreProvider>
      </StepStoreProvider>
    </ReactFlowProvider>
  )
}
