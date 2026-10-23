import { isCloud, isEnterprise, keys } from "../../keys"
import { logger } from "../../logger"
import {
  getLicenseStatus,
  LICENSE_GRACE_PERIOD_DAYS,
  type LicenseStatus,
} from "./service"

const logLicenseError = (
  state: "invalid" | "missing",
  error: string | null,
): void => {
  logger.error(
    { edition: keys().NEXT_PUBLIC_EDITION, state, error },
    "This edition requires a valid LICENSE_KEY issued for this deployment. Refusing to start.",
  )
}

const logLicenseGraceWarning = ({
  customerName,
  expiresAt,
  graceEndsAt,
}: Pick<LicenseStatus, "customerName" | "expiresAt" | "graceEndsAt">): void => {
  logger.warn(
    { customerName, expiresAt, graceEndsAt },
    `License has expired. Enterprise features keep working for ${LICENSE_GRACE_PERIOD_DAYS} days after expiry — renew before graceEndsAt or this deployment falls back to the community feature set.`,
  )
}

const logLicenseLapsedWarning = ({
  customerName,
  expiresAt,
  daysRemaining,
}: Pick<
  LicenseStatus,
  "customerName" | "expiresAt" | "daysRemaining"
>): void => {
  logger.warn(
    {
      customerName,
      expiresAt,
      daysSinceExpiry: daysRemaining === null ? null : -daysRemaining,
    },
    "License expired more than the grace period ago. Enterprise features are disabled; running with the community feature set until the license is renewed.",
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

  if (license.state === "grace") {
    logLicenseGraceWarning(license)
    return
  }

  if (license.state === "expired") {
    logLicenseLapsedWarning(license)
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
