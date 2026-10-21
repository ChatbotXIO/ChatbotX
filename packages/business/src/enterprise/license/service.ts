import { licenseRepository } from "@chatbotx.io/database/repositories"
import { decodeProtectedHeader, errors, importSPKI, jwtVerify } from "jose"
import { isCloud, isEnterprise, keys } from "../../keys"
import { logger } from "../../logger"
import { LICENSE_ISSUER, LICENSE_PUBLIC_KEYS } from "./public-keys"
import {
  type LicenseFeature,
  type LicenseLimitKey,
  type LicenseLimits,
  type LicensePayload,
  licensePayloadSchema,
} from "./schema"

const LICENSE_ALGORITHM = "EdDSA"
const LICENSE_TOKEN_TYPE = "JWT"
const DAY_IN_MS = 24 * 60 * 60 * 1000

export type LicenseState = "valid" | "expired" | "invalid" | "missing"

export interface LicenseStatus {
  customerName: string | null
  daysRemaining: number | null
  error: string | null
  expiresAt: string | null
  features: LicenseFeature[]
  issuedAt: string | null
  keyId: string | null
  licenseId: string | null
  limits: LicenseLimits | null
  state: LicenseState
  tier: LicensePayload["tier"] | null
}

export type LicenseKeyMap = Record<string, string>

export interface VerifyLicenseOptions {
  allowedTiers?: readonly LicensePayload["tier"][]
  currentDate?: Date
}

/** How long a resolved status is reused before the DB is re-read. */
const LICENSE_CACHE_TTL_MS = 60_000

let cached: { status: LicenseStatus; readAt: number } | undefined
let inFlight: Promise<LicenseStatus> | undefined
let generation = 0

const emptyLimits = (): LicenseLimits => ({
  maxWorkspaces: null,
  maxSeats: null,
  maxChannels: null,
})

const toIsoDate = (seconds: number): string =>
  new Date(seconds * 1000).toISOString()

const calculateDaysRemaining = (expiresAt: number, currentDate: Date): number =>
  Math.ceil((expiresAt * 1000 - currentDate.getTime()) / DAY_IN_MS)

const errorMessage = (error: unknown): string => {
  if (typeof error === "string") {
    return error
  }

  if (error instanceof Error) {
    return error.message
  }

  return "Unknown license verification error"
}

const missingStatus = (): LicenseStatus => ({
  state: "missing",
  licenseId: null,
  customerName: null,
  tier: null,
  features: [],
  limits: null,
  issuedAt: null,
  expiresAt: null,
  daysRemaining: null,
  keyId: null,
  error: "LICENSE_KEY is not configured",
})

const invalidStatus = (
  error: unknown,
  keyId: string | null = null,
): LicenseStatus => ({
  state: "invalid",
  licenseId: null,
  customerName: null,
  tier: null,
  features: [],
  limits: null,
  issuedAt: null,
  expiresAt: null,
  daysRemaining: null,
  keyId,
  error: errorMessage(error),
})

const statusFromPayload = ({
  state,
  payload,
  keyId,
  currentDate,
  allowedTiers,
  error = null,
}: {
  state: "valid" | "expired"
  payload: unknown
  keyId: string
  currentDate: Date
  allowedTiers?: readonly LicensePayload["tier"][]
  error?: string | null
}): LicenseStatus => {
  const parsed = licensePayloadSchema.parse(payload)

  if (allowedTiers && !allowedTiers.includes(parsed.tier)) {
    return invalidStatus(
      `License tier "${parsed.tier}" cannot be used with this edition`,
      keyId,
    )
  }

  return {
    state,
    licenseId: parsed.licenseId,
    customerName: parsed.customerName,
    tier: parsed.tier,
    features: parsed.features,
    limits: parsed.limits,
    issuedAt: toIsoDate(parsed.iat),
    expiresAt: toIsoDate(parsed.exp),
    daysRemaining: calculateDaysRemaining(parsed.exp, currentDate),
    keyId,
    error,
  }
}

export const verifyLicenseToken = async (
  token: string,
  keyMap: LicenseKeyMap = LICENSE_PUBLIC_KEYS,
  options: VerifyLicenseOptions = {},
): Promise<LicenseStatus> => {
  const currentDate = options.currentDate ?? new Date()
  let keyId: string | null = null

  try {
    const header = decodeProtectedHeader(token)
    keyId = typeof header.kid === "string" ? header.kid : null

    if (header.alg !== LICENSE_ALGORITHM) {
      return invalidStatus("License token must use EdDSA", keyId)
    }

    if (!keyId) {
      return invalidStatus("License token is missing a key id", null)
    }

    const publicKey = keyMap[keyId]
    if (!publicKey) {
      return invalidStatus(`Unknown license key id: ${keyId}`, keyId)
    }

    const verificationKey = await importSPKI(publicKey, LICENSE_ALGORITHM)
    const { payload } = await jwtVerify(token, verificationKey, {
      algorithms: [LICENSE_ALGORITHM],
      currentDate,
      issuer: LICENSE_ISSUER,
      requiredClaims: ["sub", "iat", "exp"],
      typ: LICENSE_TOKEN_TYPE,
    })

    return statusFromPayload({
      state: "valid",
      payload,
      keyId,
      currentDate,
      allowedTiers: options.allowedTiers,
    })
  } catch (error) {
    if (error instanceof errors.JWTExpired && keyId) {
      try {
        return statusFromPayload({
          state: "expired",
          payload: error.payload,
          keyId,
          currentDate,
          allowedTiers: options.allowedTiers,
          error: error.message,
        })
      } catch (parseError) {
        return invalidStatus(parseError, keyId)
      }
    }

    return invalidStatus(error, keyId)
  }
}

export const resolveAllowedTiers = ():
  | readonly LicensePayload["tier"][]
  | undefined => {
  if (isCloud()) {
    return ["cloud"]
  }

  if (isEnterprise()) {
    return ["enterprise"]
  }
}

export const isNewerLicense = (
  candidate: LicenseStatus,
  current: LicenseStatus,
): boolean => {
  if (candidate.state === "valid" && current.state === "expired") {
    return true
  }

  if (candidate.state === "expired" && current.state === "valid") {
    return false
  }

  const candidateIssuedAt = Date.parse(candidate.issuedAt ?? "")
  const currentIssuedAt = Date.parse(current.issuedAt ?? "")
  if (candidateIssuedAt !== currentIssuedAt) {
    return candidateIssuedAt > currentIssuedAt
  }

  return (
    Date.parse(candidate.expiresAt ?? "") > Date.parse(current.expiresAt ?? "")
  )
}

const readStoredToken = async (
  licenseId: string,
): Promise<string | undefined> => {
  try {
    return await licenseRepository.findTokenByLicenseId(licenseId)
  } catch (err) {
    // A fresh deployment reaches this before migrations run, and the DB can be
    // down at boot. Neither may take enterprise features offline.
    logger.warn({ err }, "license: could not read the stored license token")
    return
  }
}

const resolveLicense = async (): Promise<LicenseStatus> => {
  const envToken = keys().LICENSE_KEY?.trim()
  if (!envToken) {
    return missingStatus()
  }

  const allowedTiers = resolveAllowedTiers()
  const envStatus = await verifyLicenseToken(envToken, LICENSE_PUBLIC_KEYS, {
    allowedTiers,
  })
  if (!envStatus.licenseId) {
    return envStatus
  }

  const storedToken = await readStoredToken(envStatus.licenseId)
  if (!storedToken) {
    return envStatus
  }

  const storedStatus = await verifyLicenseToken(
    storedToken,
    LICENSE_PUBLIC_KEYS,
    { allowedTiers },
  )
  if (
    storedStatus.state === "invalid" ||
    storedStatus.licenseId !== envStatus.licenseId
  ) {
    logger.warn(
      {
        err: storedStatus.error,
        licenseId: envStatus.licenseId,
        state: storedStatus.state,
      },
      "license: ignoring an unusable stored license token",
    )
    return envStatus
  }

  return isNewerLicense(storedStatus, envStatus) ? storedStatus : envStatus
}

export const loadLicense = (): Promise<LicenseStatus> => {
  if (cached && Date.now() - cached.readAt < LICENSE_CACHE_TTL_MS) {
    return Promise.resolve(cached.status)
  }

  if (inFlight) {
    return inFlight
  }

  const cacheGeneration = generation
  let pending: Promise<LicenseStatus>
  pending = resolveLicense()
    .then((status) => {
      if (generation === cacheGeneration) {
        cached = { status, readAt: Date.now() }
      }
      return status
    })
    .finally(() => {
      if (inFlight === pending) {
        inFlight = undefined
      }
    })
  inFlight = pending

  return pending
}

/** Drop the TTL cache so the next read re-resolves immediately. */
export const invalidateLicenseCache = (): void => {
  generation += 1
  cached = undefined
  inFlight = undefined
}

export const getLicense = loadLicense

export const getLicenseStatus = loadLicense

export const hasFeature = async (feature: LicenseFeature): Promise<boolean> => {
  const license = await getLicense()

  return license.state === "valid" && license.features.includes(feature)
}

export const getLimit = async (
  key: LicenseLimitKey,
): Promise<LicenseLimits[LicenseLimitKey] | undefined> => {
  const license = await getLicense()

  if (license.state !== "valid") {
    return
  }

  return (license.limits ?? emptyLimits())[key]
}
