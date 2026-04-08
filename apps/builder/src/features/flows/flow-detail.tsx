"use client"

import type { OrganizationSettings } from "@chatbotx.io/database/partials"
import { ReactFlowProvider } from "@xyflow/react"
import { AIToolsStoreProvider } from "../ai-tools/provider/ai-tools-store-context"
import { CustomFieldStoreProvider } from "../custom-fields/provider/custom-field-store-context"
import type { FlowVersionResource } from "../flow-versions/schema/resource"
import { InboxStoreProvider } from "../inboxes/provider/inbox-store-context"
import type { OrganizationResource } from "../organization/schema/resource"
import { TagStoreProvider } from "../tags/provider/tag-store-context"
import { UserStoreProvider } from "../users/provider/user-store-context"
import { FlowStoreProvider } from "./provider/flow-store-context"
import { ReactFlowFrame } from "./react-flow/frame"
import { FlowActionProvider } from "./react-flow/stores/flow-action-store-provider"
import { StepStoreProvider } from "./react-flow/stores/step-store-provider"
import type { FlowResource } from "./schemas/resource"

type FlowDetailProps = {
  flow: FlowResource
  flowVersion: FlowVersionResource
  organization: OrganizationResource
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
        <FlowActionProvider workspaceId={flow.workspaceId}>
          <InboxStoreProvider workspaceId={flow.workspaceId}>
            <FlowStoreProvider workspaceId={flow.workspaceId}>
              <TagStoreProvider workspaceId={flow.workspaceId}>
                <UserStoreProvider workspaceId={flow.workspaceId}>
                  <CustomFieldStoreProvider workspaceId={flow.workspaceId}>
                    <AIToolsStoreProvider workspaceId={flow.workspaceId}>
                      <ReactFlowFrame flow={flow} flowVersion={flowVersion} />
                    </AIToolsStoreProvider>
                  </CustomFieldStoreProvider>
                </UserStoreProvider>
              </TagStoreProvider>
            </FlowStoreProvider>
          </InboxStoreProvider>
        </FlowActionProvider>
      </StepStoreProvider>
    </ReactFlowProvider>
  )
}
