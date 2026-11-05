import { ChatbotXException } from "../errors"

/** The template an installation came from was deleted or never existed. */
export const templateSourceMissingException = () =>
  new ChatbotXException(
    "The source template for this installation is no longer available",
    "templateInstallationSourceMissing",
  )

/** A sync of the installation is queued or running: the request has to wait for it. */
export const templateSyncInProgressException = () =>
  new ChatbotXException(
    "A sync of this installation is in progress",
    "templateSyncInProgress",
    409,
  )

/** The installation (or one of its copies) is being uninstalled: edits, toggles, syncs and new references wait. */
export const templateUninstallInProgressException = () =>
  new ChatbotXException(
    "This template is being uninstalled",
    "templateUninstallInProgress",
    409,
  )

/** The installer did not allow the publisher to uninstall this template. */
export const templateUninstallNotGrantedException = () =>
  new ChatbotXException(
    "The installer did not allow this template to be uninstalled by its publisher",
    "templateUninstallNotGranted",
    403,
  )

/** A backup (or its target) can not be restored: wrong format, kind or an update-less handler. */
export const templateBackupNotRestorableException = () =>
  new ChatbotXException(
    "This backup can not be restored",
    "templateBackupNotRestorable",
    409,
  )

/** No uninstall handler is registered for a tracked kind; `data.resourceKind` names it. */
export const templateUninstallNoHandlerException = (resourceKind: string) => {
  const exception = new ChatbotXException(
    `No uninstall handler for ${resourceKind}`,
    "templateUninstallNoHandler",
  )
  exception.data = { resourceKind }
  return exception
}

/**
 * ONE representation of "this worker no longer owns the row": a lease (install,
 * sync, uninstall) was taken over by a newer claim. The winner owns the row, so
 * the loser aborts without releasing or failing it.
 */
export const TEMPLATE_LEASE_LOST_CODES: ReadonlySet<string> = new Set([
  "templateInstallLeaseLost",
  "templateSyncLeaseLost",
  "templateUninstallLeaseLost",
])

export class TemplateUninstallClaimLostError extends ChatbotXException {
  constructor() {
    super("The uninstall lease was lost", "templateUninstallLeaseLost")
    this.name = "TemplateUninstallClaimLostError"
  }
}

export const isTemplateLeaseLost = (error: unknown): boolean =>
  error instanceof ChatbotXException &&
  TEMPLATE_LEASE_LOST_CODES.has(error.code)

/**
 * Failures a retry can never fix (install, sync and uninstall share one set):
 * the worker closes the row and stops BullMQ's retries, and an automatic update
 * does not try that version again. Anything else is transient: the work rolled
 * back and the claim is released for a retry.
 */
export const PERMANENT_TEMPLATE_ERROR_CODES = [
  "templatePayloadIncompatible",
  "templateInstallationSourceMissing",
  "templateCrossTenantInstall",
  "templateInstallIntoSource",
  "templateCategoryPermissionDenied",
  "templateInvalidInboxBinding",
  "templateUninstallNotGranted",
  "templateUninstallNoHandler",
] as const

const PERMANENT_ERROR_CODE_SET: ReadonlySet<string> = new Set(
  PERMANENT_TEMPLATE_ERROR_CODES,
)

export const isPermanentTemplateError = (code: string): boolean =>
  PERMANENT_ERROR_CODE_SET.has(code)

/** The machine code of a failure: a `ChatbotXException`'s own, else the caller's fallback. */
export const templateErrorCodeOf = (
  error: unknown,
  fallback: string,
): string => (error instanceof ChatbotXException ? error.code : fallback)

/**
 * The white-label default template can not be set: the template or key is
 * wrong. One generic answer for every cause (missing, deleted, other tenant,
 * wrong key) so the endpoint is no oracle for template ids.
 */
export const tenantDefaultTemplateUnavailableException = () =>
  new ChatbotXException(
    "The template ID or key is not valid",
    "tenantDefaultTemplateUnavailable",
    404,
  )

/** The key matched, but the template's share link is off or expired. */
export const tenantDefaultTemplateShareDisabledException = () =>
  new ChatbotXException(
    "Turn the template's share link on before using it as a default",
    "tenantDefaultTemplateShareDisabled",
    409,
  )

/** A copy that crosses tenants can not give its publisher access to the workspace. */
export const templatePublisherGrantCrossTenantException = () =>
  new ChatbotXException(
    "A template from another tenant can not be given access to this workspace",
    "templatePublisherGrantCrossTenant",
    409,
  )
