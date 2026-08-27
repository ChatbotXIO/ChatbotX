import { isCloud, isEnterprise, keys } from "../../keys"
import { logger } from "../../logger"
import { getLicenseStatus } from "./service"

const logLicenseDegraded = (
  state: "invalid" | "missing",
  error: string | null,
): void => {
  logger.warn(
    { edition: keys().NEXT_PUBLIC_EDITION, state, error },
    "Enterprise license missing or invalid; starting degraded without enterprise features.",
  )
}

const logLicenseExpiredWarning = ({
  customerName,
  expiresAt,
  daysRemaining,
}: {
  customerName: string | null
  expiresAt: string | null
  daysRemaining: number | null
}): void => {
  logger.warn(
    {
      customerName,
      expiresAt,
      daysSinceExpiry: daysRemaining ? -daysRemaining : null,
    },
    "License has expired. Enterprise features are disabled until the license is renewed.",
  )
}

export const assertLicenseAtStartup = async (): Promise<void> => {
  if (!(isEnterprise() || isCloud())) {
    return
  }

  const license = await getLicenseStatus()

  if (license.state === "missing" || license.state === "invalid") {
    // FORK fibrazo/sysbrazo: do not abort startup when no valid LICENSE_KEY is
    // configured. Degrade to the community feature set instead of refusing to
    // start (see FORK-CHANGES.md "Desbloquear edición enterprise").
    logLicenseDegraded(license.state, license.error)
    return
  }

  if (license.state === "expired") {
    logLicenseExpiredWarning(license)
    return
  }

  logger.info(
    {
      tier: license.tier,
      customerName: license.customerName,
      daysRemaining: license.daysRemaining,
    },
    "License verified",
  )
}
