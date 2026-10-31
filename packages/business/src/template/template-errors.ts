import { ChatbotXException } from "../errors"

/** The template an installation came from was deleted or never existed. */
export const templateSourceMissingException = () =>
  new ChatbotXException(
    "The source template for this installation is no longer available",
    "templateInstallationSourceMissing",
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
 * the worker closes the row and stops BullMQ's retries. Anything else is
 * transient, the work rolled back, and the claim is released for a retry.
 */
const PERMANENT_TEMPLATE_ERROR_CODES: ReadonlySet<string> = new Set([
  "templatePayloadIncompatible",
  "templateInstallationSourceMissing",
  "templateCrossTenantInstall",
  "templateCategoryPermissionDenied",
  "templateInvalidInboxBinding",
  "templateUninstallNotGranted",
  "templateUninstallNoHandler",
])

export const isPermanentTemplateError = (code: string): boolean =>
  PERMANENT_TEMPLATE_ERROR_CODES.has(code)

/** The machine code of a failure: a `ChatbotXException`'s own, else the caller's fallback. */
export const templateErrorCodeOf = (
  error: unknown,
  fallback: string,
): string => (error instanceof ChatbotXException ? error.code : fallback)
