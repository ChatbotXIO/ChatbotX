export const workingHoursListHref = (workspaceId: string) =>
  `/space/${workspaceId}/settings/inbox-teams`

export const workingHoursEditorHref = (
  workspaceId: string,
  workingHoursId: string,
) => `${workingHoursListHref(workspaceId)}/working-hours/${workingHoursId}`
