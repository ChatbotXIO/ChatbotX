"use client"

import type {
  OrganizationModel,
  OrganizationSettings,
} from "@aha.chat/database/types"
import { type Node, ReactFlowProvider } from "@xyflow/react"
import { use } from "react"
import { reservedCustomFieldOptions } from "../custom-fields/lib/reserved-custom-field"
import type { listCustomFields } from "../custom-fields/queries"
import type { listFlowVersions } from "../flow-versions/queries/list-flow-versions"
import type { getTags } from "../tags/queries"
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
      Awaited<ReturnType<typeof listCustomFields>>,
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
  const [{ data: customFields }, { data: flowVersions }, { data: tags }] =
    use(promises)

  const customFieldOptions = {
    ...reservedCustomFieldOptions,
    ...customFields.map((field) => ({
      label: field.name,
      value: field.id,
      type: field.customFieldType,
    })),
  }

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
          customFieldOptions,
          flowOptions,
          tagOptions,
          organizationSetings:
            organization.settings as unknown as OrganizationSettings,
        }}
      >
        <ReactFlowFrame flow={flow} flowVersion={flowVersion} />
      </StepStoreProvider>
    </ReactFlowProvider>
  )
}
