/**
 * Stages an item can be moved to: every stage but its current one, minus the
 * stages running a bulk job (they accept no new items).
 */
export const moveTargetStages = <
  T extends { stage: { id: string; bulkJobId?: string | null } },
>(
  columns: T[],
  currentStageId: string | undefined,
): T[] =>
  columns.filter(({ stage }) => stage.id !== currentStageId && !stage.bulkJobId)
