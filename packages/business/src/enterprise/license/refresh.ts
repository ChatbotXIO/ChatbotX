import { licenseRepository } from "@chatbotx.io/database/repositories"
import { z } from "zod"
import { isCloud, isEnterprise, keys } from "../../keys"
import { logger } from "../../logger"
import { LICENSE_PUBLIC_KEYS } from "./public-keys"
import type { LicenseState } from "./service"
import {
  getLicenseStatus,
  invalidateLicenseCache,
  isNewerLicense,
  resolveAllowedTiers,
  verifyLicenseToken,
} from "./service"

/** The vendor server is remote; never let a hung request wedge the cron. */
const REFRESH_TIMEOUT_MS = 10_000

const refreshResponseSchema = z.object({ token: z.string().min(1) })

export type LicenseRefreshOutcome =
  | {
      status: "skipped"
      reason: "community" | "disabled" | LicenseState
    }
  | {
      status: "failed"
      reason: "requestFailed" | `http_${number}` | "badBody" | "rejectedToken"
    }
  | {
      status: "refreshed" | "unchanged"
      expiresAt: string
    }

export const refreshLicense = async (): Promise<LicenseRefreshOutcome> => {
  if (!(isEnterprise() || isCloud())) {
    return { status: "skipped", reason: "community" }
  }

  const {
    LICENSE_KEY,
    LICENSE_REFRESH_ENABLED,
    LICENSE_REFRESH_URL,
    NEXT_PUBLIC_EDITION,
  } = keys()
  if (!LICENSE_REFRESH_ENABLED) {
    return { status: "skipped", reason: "disabled" }
  }

  const current = await getLicenseStatus()
  if (!(current.licenseId && LICENSE_KEY)) {
    return { status: "skipped", reason: current.state }
  }

  let response: Response
  try {
    response = await fetch(LICENSE_REFRESH_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token: LICENSE_KEY.trim(),
        licenseId: current.licenseId,
        edition: NEXT_PUBLIC_EDITION,
      }),
      signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
    })
  } catch (err) {
    logger.error(
      { err, licenseId: current.licenseId },
      "license: refresh request failed",
    )
    return { status: "failed", reason: "requestFailed" }
  }

  if (!response.ok) {
    logger.error(
      { licenseId: current.licenseId, status: response.status },
      "license: refresh returned a non-OK status",
    )
    try {
      await response.body?.cancel()
    } catch (err) {
      logger.warn(
        { err, licenseId: current.licenseId, status: response.status },
        "license: could not cancel the refresh response body",
      )
    }
    return { status: "failed", reason: `http_${response.status}` }
  }

  const parsed = refreshResponseSchema.safeParse(
    await response.json().catch(() => null),
  )
  if (!parsed.success) {
    logger.error(
      { licenseId: current.licenseId },
      "license: refresh returned an unreadable body",
    )
    return { status: "failed", reason: "badBody" }
  }

  const next = await verifyLicenseToken(
    parsed.data.token,
    LICENSE_PUBLIC_KEYS,
    { allowedTiers: resolveAllowedTiers() },
  )
  if (
    next.state !== "valid" ||
    next.licenseId !== current.licenseId ||
    !next.expiresAt
  ) {
    logger.error(
      { licenseId: current.licenseId, state: next.state },
      "license: refresh returned a token this deployment cannot use",
    )
    return { status: "failed", reason: "rejectedToken" }
  }

  if (!isNewerLicense(next, current)) {
    return {
      status: "unchanged",
      expiresAt: current.expiresAt ?? next.expiresAt,
    }
  }

  await licenseRepository.upsert({
    licenseId: current.licenseId,
    token: parsed.data.token,
    expiresAt: new Date(next.expiresAt),
  })
  invalidateLicenseCache()
  logger.info(
    {
      licenseId: current.licenseId,
      expiresAt: next.expiresAt,
      daysRemaining: next.daysRemaining,
    },
    "license: refreshed",
  )

  return { status: "refreshed", expiresAt: next.expiresAt }
}
