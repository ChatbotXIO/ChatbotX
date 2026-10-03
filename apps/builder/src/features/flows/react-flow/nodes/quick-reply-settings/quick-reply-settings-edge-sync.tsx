"use client"

import { type QuickReplyNextStep, stepTypes } from "@chatbotx.io/flow-config"
import { useReactFlow } from "@xyflow/react"
import { useEffect } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { useHandleEdges } from "../../hooks/use-button-target"
import {
  isQuickReplySettingsEdgeInSync,
  type QuickReplySettingsSectionName,
  resolveQuickReplySettingsEdge,
} from "./edge"

/**
 * Keeps one settings section's canvas edge in step with the form: switching
 * the section off, clearing its target or pointing it off-canvas removes the
 * edge, and switching it back on restores it.
 *
 * It renders nothing and sits outside the settings dialog, so it still runs
 * after the dialog closes or the section's picker unmounts. Effect inputs are
 * primitives and the canvas is only touched when it disagrees, so a canvas
 * connect (which already wrote the target) causes no extra `setEdges`.
 */
export function QuickReplySettingsEdgeSync({
  active,
  nodeId,
  sectionName,
}: {
  active: boolean
  nodeId: string
  sectionName: QuickReplySettingsSectionName
}) {
  const { getEdges } = useReactFlow()
  const { refreshEdge, removeEdge } = useHandleEdges()
  const handleId = useWatch({ name: `${sectionName}.id` }) as string | undefined
  const enabled = useWatch({ name: `${sectionName}.enabled` }) as
    | boolean
    | undefined
  const target = useWatch({ name: `${sectionName}.target` }) as
    | QuickReplyNextStep
    | null
    | undefined

  const desired = resolveQuickReplySettingsEdge({
    active,
    enabled,
    handleId,
    target,
  })
  const desiredTargetNodeId =
    desired?.kind === "edge" ? desired.targetNodeId : null
  const hasDesired = desired !== null

  useEffect(() => {
    if (!(handleId && hasDesired)) {
      return
    }
    const next = desiredTargetNodeId
      ? ({ kind: "edge", targetNodeId: desiredTargetNodeId } as const)
      : ({ kind: "none" } as const)
    if (
      isQuickReplySettingsEdgeInSync(getEdges(), {
        handleId,
        nodeId,
        desired: next,
      })
    ) {
      return
    }

    if (next.kind === "edge") {
      refreshEdge(handleId, nodeId, next.targetNodeId)
    } else {
      removeEdge(handleId)
    }
  }, [
    desiredTargetNodeId,
    getEdges,
    handleId,
    hasDesired,
    nodeId,
    refreshEdge,
    removeEdge,
  ])

  return null
}

/** Retry cannot run next to a Get User Data step (schema rule and worker). */
export function useHasGetUserDataStep(): boolean {
  const steps = useWatch({ name: "steps" }) as
    | { stepType?: string }[]
    | undefined
  return (steps ?? []).some(
    (step) => step?.stepType === stepTypes.enum.getUserData,
  )
}

/**
 * Both sections' edge syncs. Mounted by the node editor for every node that
 * carries quick replies, whether or not any exist yet: with none, settings
 * are ignored and the canvas renders no settings handles, so their edges go
 * too and come back when a quick reply is added again.
 */
export function QuickReplySettingsEdgeSyncs({
  hasQuickReplies,
  nodeId,
}: {
  hasQuickReplies: boolean
  nodeId: string
}) {
  const hasGetUserData = useHasGetUserDataStep()
  const { getValues, trigger } = useFormContext()

  // Adding a Get User Data step while Retry is on silently drops the retry
  // edge and handle (the sync goes inactive): surface the schema error now
  // instead of at the next dialog open or publish.
  useEffect(() => {
    if (hasGetUserData && getValues("quickReplySettings.retry.enabled")) {
      trigger("quickReplySettings.retry")
    }
  }, [getValues, hasGetUserData, trigger])

  return (
    <>
      <QuickReplySettingsEdgeSync
        active={hasQuickReplies}
        nodeId={nodeId}
        sectionName="quickReplySettings.followUp"
      />
      <QuickReplySettingsEdgeSync
        active={hasQuickReplies && !hasGetUserData}
        nodeId={nodeId}
        sectionName="quickReplySettings.retry"
      />
    </>
  )
}
