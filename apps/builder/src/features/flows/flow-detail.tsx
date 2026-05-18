"use client"

import { ReactFlowProvider } from "@xyflow/react"
import { PlatformCredentialsStoreProvider } from "@/features/platform-credentials/provider/platform-credentials-store-context"
import { AIAgentStoreProvider } from "../ai-agents/provider/ai-agent-store-context"
import { AIToolsStoreProvider } from "../ai-tools/provider/ai-tools-store-context"
import { CustomFieldStoreProvider } from "../custom-fields/provider/custom-field-store-context"
import type { FlowVersionResource } from "../flow-versions/schema/resource"
import { InboxStoreProvider } from "../inboxes/provider/inbox-store-context"
import { TagStoreProvider } from "../tags/provider/tag-store-context"
import { UserStoreProvider } from "../users/provider/user-store-context"
import { FlowStoreProvider } from "./provider/flow-store-context"
import { ReactFlowFrame } from "./react-flow/frame"
import { FlowTemplateStoreProvider } from "./react-flow/stores/flow-template-store-provider"
import { StepStoreProvider } from "./react-flow/stores/step-store-provider"
import type { FlowResource } from "./schemas/resource"

type FlowDetailProps = {
  flow: FlowResource
  flowVersion: FlowVersionResource
}

export function FlowDetail({ flow, flowVersion }: FlowDetailProps) {
  return (
    <ReactFlowProvider>
      <StepStoreProvider
        initialState={{
          activeFlowId: flow.id,
        }}
      >
        <FlowTemplateStoreProvider workspaceId={flow.workspaceId}>
          <InboxStoreProvider workspaceId={flow.workspaceId}>
            <FlowStoreProvider workspaceId={flow.workspaceId}>
              <TagStoreProvider workspaceId={flow.workspaceId}>
                <UserStoreProvider workspaceId={flow.workspaceId}>
                  <CustomFieldStoreProvider workspaceId={flow.workspaceId}>
                    <AIToolsStoreProvider workspaceId={flow.workspaceId}>
                      <PlatformCredentialsStoreProvider>
                        <AIAgentStoreProvider workspaceId={flow.workspaceId}>
                          <ReactFlowFrame
                            flow={flow}
                            flowVersion={flowVersion}
                          />
                        </AIAgentStoreProvider>
                      </PlatformCredentialsStoreProvider>
                    </AIToolsStoreProvider>
                  </CustomFieldStoreProvider>
                </UserStoreProvider>
              </TagStoreProvider>
            </FlowStoreProvider>
          </InboxStoreProvider>
        </FlowTemplateStoreProvider>
      </StepStoreProvider>
    </ReactFlowProvider>
  )
}
