/**
 * The draft's stage and custom-field values that still exist in the pipeline.
 * The pipeline can change while the add sheet is open (a realtime refetch): a
 * deleted field or stage left in the draft would make every save fail.
 * An empty `stageId` means "the first open stage".
 */
export const liveDraftTargets = (
  draft: { stageId: string; fieldValues: Record<string, string> },
  pipeline: {
    openStageIds: readonly string[]
    fieldIds: readonly string[]
  },
): { stageId: string; fieldValues: Record<string, string> } => ({
  stageId: pipeline.openStageIds.includes(draft.stageId) ? draft.stageId : "",
  fieldValues: Object.fromEntries(
    Object.entries(draft.fieldValues).filter(([id]) =>
      pipeline.fieldIds.includes(id),
    ),
  ),
})
