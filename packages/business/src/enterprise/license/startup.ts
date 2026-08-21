import { isCloud, isEnterprise, keys } from "../../keys"
import { logger } from "../../logger"
import { getLicenseStatus } from "./service"

const logLicenseError = (
  state: "invalid" | "missing",
  error: string | null,
): void => {
  logger.error(
    { edition: keys().NEXT_PUBLIC_EDITION, state, error },
    "This edition requires a valid LICENSE_KEY issued for this deployment. Refusing to start.",
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
    logLicenseError(license.state, license.error)
    process.exit(1)
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
