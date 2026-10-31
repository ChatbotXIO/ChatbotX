/**
 * Where the storage objects an install copies live. Every key is
 * `<namespace prefix of this installation>/g<generation>/<sha of the source
 * object>`. Within one generation a redelivery of the same attempt overwrites
 * the same key (no orphan per attempt); a manual retry of a failed install
 * moves to the next generation, so cleaning up the failed generation (which
 * lists and deletes by prefix) can never touch what the retry writes.
 * `tpl-<id>/` stays the root of everything an installation staged, which is
 * what an uninstall matches.
 *
 * The three namespaces stay apart on purpose: private AI files, public
 * questionnaire media and the public media library each have their own
 * storage rules, so there is no single `templates/installs/<id>/` root.
 */

/**
 * Which keys one staging run writes. `generation` is
 * `TemplateInstallation.stagingGeneration`; a sync adds its `attemptKey`, so
 * two claims of one sync (a lease takeover) never share a key and a loser's
 * path-level cleanup cannot delete the winner's objects.
 */
export type StagingScope = { generation: number; attemptKey?: string }

const scopeSegment = (scope: StagingScope): string =>
  `g${scope.generation}/${scope.attemptKey ? `${scope.attemptKey}/` : ""}`

const savedReplyRoot = (workspaceId: string, installationId: string): string =>
  `public/space/${workspaceId}/media-library/tpl-${installationId}`

const aiFileRoot = (workspaceId: string, installationId: string): string =>
  `workspaces/${workspaceId}/ai-files/tpl-${installationId}`

const questionnaireImageRoot = (
  workspaceId: string,
  installationId: string,
): string =>
  `public/space/${workspaceId}/questionnaire-images/tpl-${installationId}`

/** Saved-reply images a staging run of `scope` writes under. */
export const savedReplyImagePrefix = (
  workspaceId: string,
  installationId: string,
  scope: StagingScope,
): string =>
  `${savedReplyRoot(workspaceId, installationId)}/${scopeSegment(scope)}`

/**
 * Every prefix an uninstall may delete a saved-reply image from: the
 * installation's own root, plus the `tpl-<id>:` roots older syncs and installs
 * staged under.
 */
export const savedReplyImageOwnedPrefixes = (
  workspaceId: string,
  installationId: string,
): string[] => [
  `${savedReplyRoot(workspaceId, installationId)}/`,
  `${savedReplyRoot(workspaceId, installationId)}:`,
]

export const aiFileObjectPrefix = (
  workspaceId: string,
  installationId: string,
  scope: StagingScope,
): string => `${aiFileRoot(workspaceId, installationId)}/${scopeSegment(scope)}`

export const questionnaireImagePrefix = (
  workspaceId: string,
  installationId: string,
  scope: StagingScope,
): string =>
  `${questionnaireImageRoot(workspaceId, installationId)}/${scopeSegment(scope)}`

/** Every prefix one generation of an installation's staging wrote under. */
export const installObjectPrefixes = (
  workspaceId: string,
  installationId: string,
  generation: number,
): string[] => {
  const scope = { generation }
  return [
    aiFileObjectPrefix(workspaceId, installationId, scope),
    questionnaireImagePrefix(workspaceId, installationId, scope),
    savedReplyImagePrefix(workspaceId, installationId, scope),
  ]
}
