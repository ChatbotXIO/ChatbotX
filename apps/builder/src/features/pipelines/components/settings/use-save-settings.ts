import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import {
  removeMemberAction,
  setMemberAction,
} from "../../actions/field-member.action"
import { updatePipelineAction } from "../../actions/pipeline.action"
import { useInvalidatePipelines } from "../../lib/use-invalidate-pipelines"
import type { BoardPipeline } from "../board/types"
import type { buildPipelineUpdate, PermissionChange } from "./settings-draft"

export type SettingsPipeline = Pick<
  BoardPipeline,
  "id" | "name" | "referenceName" | "currency" | "settings"
>

type ActionResult =
  | { serverError?: string; validationErrors?: unknown }
  | undefined

type SaveInput = {
  pipelineId: string
  pipelineUpdate: ReturnType<typeof buildPipelineUpdate>
  permissionChanges: PermissionChange[]
}

/**
 * Saves the settings sheet in one go: the pipeline update first, then each
 * changed member grant, one at a time, stopping at the first failure. One
 * toast reports the outcome and the pipeline queries refetch once all writes
 * have settled (applied writes stay applied; the refetch shows them).
 */
export function useSaveSettings(workspaceId: string) {
  const t = useTranslations("pipelines")
  const invalidate = useInvalidatePipelines()
  const [isSaving, setIsSaving] = useState(false)

  const writes = ({
    pipelineId,
    pipelineUpdate,
    permissionChanges,
  }: SaveInput): Array<() => Promise<ActionResult>> => [
    ...(pipelineUpdate
      ? [
          () =>
            updatePipelineAction(workspaceId, {
              id: pipelineId,
              ...pipelineUpdate,
            }),
        ]
      : []),
    ...permissionChanges.map((change) =>
      change.kind === "remove"
        ? () =>
            removeMemberAction(workspaceId, {
              id: pipelineId,
              workspaceMemberId: change.workspaceMemberId,
            })
        : () =>
            setMemberAction(workspaceId, {
              id: pipelineId,
              workspaceMemberId: change.workspaceMemberId,
              ...change.flags,
            }),
    ),
  ]

  const save = async (input: SaveInput): Promise<boolean> => {
    setIsSaving(true)
    let failure: string | null = null
    try {
      for (const write of writes(input)) {
        const result = await write()
        if (!result || result.serverError || result.validationErrors) {
          failure = result?.serverError ?? t("saveFailed")
          break
        }
      }
    } catch {
      failure = t("saveFailed")
    }
    try {
      // Waits for the refetch, so the sheet shows saved values (not the old
      // grants) the moment the draft is cleared.
      await invalidate()
    } finally {
      setIsSaving(false)
    }
    if (failure) {
      toast.error(failure)
      return false
    }
    toast.success(t("settings.saved"))
    return true
  }

  return { save, isSaving }
}
