"use client"

import type {
  OrganizationModel,
  OrganizationSettings,
} from "@aha.chat/database/types"
import { type Node, ReactFlowProvider } from "@xyflow/react"
import { use } from "react"
import { CustomFieldStoreProvider } from "../custom-fields/provider/custom-field-store-context"
import type { listFlowVersions } from "../flow-versions/queries/list-flow-versions"
import { TagStoreProvider } from "../tags/provider/tag-store-context"
import type { getTags } from "../tags/queries"
import { UserStoreProvider } from "../users/provider/user-store-context"
import { ReactFlowFrame } from "./react-flow/frame"
import { StepStoreProvider } from "./react-flow/stores/step-store-provider"
import type {
  FlowResource,
  FlowVersionResource,
} from "./schemas/get-flows-schema"

type FlowDetailProps = {
  flow: FlowResource
  flowVersion: FlowVersionResource
  organization: OrganizationModel
  promises: Promise<
    [
      Awaited<ReturnType<typeof listFlowVersions>>,
      Awaited<ReturnType<typeof getTags>>,
    ]
  >
}

export function FlowDetail({
  flow,
  flowVersion,
  organization,
  promises,
}: FlowDetailProps) {
  const [{ data: flowVersions }, { data: tags }] = use(promises)

  const flowOptions = flowVersions.map((fv) => ({
    label: fv.flow.name,
    value: fv.flow.id,
    nodes: fv.nodes as unknown as Node[],
  }))

  const tagOptions = tags.map((tag) => ({
    text: tag.name,
    id: tag.id,
  }))

  return (
    <ReactFlowProvider>
      <StepStoreProvider
        initialState={{
          flowOptions,
          tagOptions,
          organizationSetings:
            organization.settings as unknown as OrganizationSettings,
        }}
      >
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
      </StepStoreProvider>
    </ReactFlowProvider>
  )
}
