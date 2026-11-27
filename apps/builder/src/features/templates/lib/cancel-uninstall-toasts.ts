type CancelToastKey =
  | "templates.uninstall.keptPartlyRemoved"
  | "templates.uninstall.keptInactiveForReview"
  | "templates.uninstall.keptHistoryRemoved"
  | "templates.uninstall.cancelledPartial"
  | "templates.uninstall.cancelled"

type Translate = (key: CancelToastKey, values?: { count: number }) => string

export type CancelUninstallSummary = {
  keptPartlyRemoved: number
  keptInactiveForReview: number
  keptHistoryRemoved: number
  alreadyCommitted: number
}

export type CancelToast = {
  level: "info" | "warning" | "success"
  message: string
}

/**
 * What a cancelled uninstall tells the person, in order: one line for each
 * kind of copy that was not given back whole, then either the "past the point
 * of no return" count or the plain success. Pure so the wording rules can be
 * tested without a toaster.
 */
export const cancelUninstallToasts = (
  t: Translate,
  data: CancelUninstallSummary | undefined,
): CancelToast[] => {
  const toasts: CancelToast[] = []
  if (data && data.keptPartlyRemoved > 0) {
    toasts.push({
      level: "info",
      message: t("templates.uninstall.keptPartlyRemoved", {
        count: data.keptPartlyRemoved,
      }),
    })
  }
  if (data && data.keptInactiveForReview > 0) {
    toasts.push({
      level: "warning",
      message: t("templates.uninstall.keptInactiveForReview", {
        count: data.keptInactiveForReview,
      }),
    })
  }
  if (data && data.keptHistoryRemoved > 0) {
    toasts.push({
      level: "info",
      message: t("templates.uninstall.keptHistoryRemoved", {
        count: data.keptHistoryRemoved,
      }),
    })
  }
  if (data && data.alreadyCommitted > 0) {
    // Past the point of no return: not given back, it finishes deleting.
    toasts.push({
      level: "info",
      message: t("templates.uninstall.cancelledPartial", {
        count: data.alreadyCommitted,
      }),
    })
  } else {
    toasts.push({
      level: "success",
      message: t("templates.uninstall.cancelled"),
    })
  }
  return toasts
}
