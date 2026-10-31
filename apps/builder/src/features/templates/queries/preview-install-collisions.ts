import {
  type PredictedAction,
  type PredictedCollision,
  previewInstallCollisions,
  type TemplateActor,
  templateService,
} from "@chatbotx.io/business"

export type InstallCollisionPreview = {
  collisions: PredictedCollision[]
  summary: Record<PredictedAction, number>
}

/**
 * What installing the template behind `shareToken` would do to the items it
 * carries (tags, custom fields, folders, ...) in `targetWorkspaceId`. Runs the
 * same install gates as the install itself, so a link that cannot be installed
 * throws here too; read only.
 */
export const previewInstallCollisionsForShare = async (input: {
  shareToken: string
  targetWorkspaceId: string
  actor: TemplateActor
  /** Which of the target's inboxes stand in for the template's: `{ templateInboxId: inboxId }`. */
  inboxBindings?: Readonly<Record<string, string>>
}): Promise<InstallCollisionPreview> => {
  const { template, payload } = await templateService.assertInstallable(input)
  return await previewInstallCollisions({
    workspaceId: input.targetWorkspaceId,
    manifests: payload.manifests,
    botFields: payload.resources.settings.botFields,
    createInstallFolder: template.createInstallFolder,
    inboxBindings: input.inboxBindings,
  })
}
