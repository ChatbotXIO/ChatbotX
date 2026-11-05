import {
  TEMPLATE_UNINSTALL_ACTIVE_STATES,
  type TemplateUninstallState,
} from "@chatbotx.io/database/partials"

/** An uninstall is queued or running: the page polls and blocks sync, restore and a second request. */
export const isUninstallInProgress = (
  state: TemplateUninstallState | undefined,
): boolean =>
  state !== undefined && TEMPLATE_UNINSTALL_ACTIVE_STATES.includes(state)

/** A finished-but-incomplete uninstall: requesting it again retries only what is left. */
export const canRetryUninstall = (
  state: TemplateUninstallState | undefined,
): boolean => state === "partial" || state === "failed" || state === "skipped"

const UNINSTALL_STATE_LABEL_KEY = {
  pending: "templates.uninstall.state.pending",
  running: "templates.uninstall.state.running",
  partial: "templates.uninstall.state.partial",
  failed: "templates.uninstall.state.failed",
  skipped: "templates.uninstall.state.skipped",
} as const

export const uninstallStateLabelKey = (
  state: TemplateUninstallState,
):
  | (typeof UNINSTALL_STATE_LABEL_KEY)[keyof typeof UNINSTALL_STATE_LABEL_KEY]
  | null =>
  state in UNINSTALL_STATE_LABEL_KEY
    ? UNINSTALL_STATE_LABEL_KEY[state as keyof typeof UNINSTALL_STATE_LABEL_KEY]
    : null

const UNINSTALL_ACTION_LABEL_KEY = {
  inProgress: "templates.uninstall.inProgress",
  retry: "templates.uninstall.retry",
  action: "templates.uninstall.action",
} as const

export const uninstallActionLabelKey = (
  state: TemplateUninstallState | undefined,
): (typeof UNINSTALL_ACTION_LABEL_KEY)[keyof typeof UNINSTALL_ACTION_LABEL_KEY] => {
  if (isUninstallInProgress(state)) {
    return UNINSTALL_ACTION_LABEL_KEY.inProgress
  }
  return canRetryUninstall(state)
    ? UNINSTALL_ACTION_LABEL_KEY.retry
    : UNINSTALL_ACTION_LABEL_KEY.action
}
