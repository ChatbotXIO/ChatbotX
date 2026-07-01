import { decodeProtectedHeader, errors, importSPKI, jwtVerify } from "jose"
import { keys } from "../../keys"
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
  currentDate?: Date
}

let cachedLicense: Promise<LicenseStatus> | undefined

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
  error = null,
}: {
  state: "valid" | "expired"
  payload: unknown
  keyId: string
  currentDate: Date
  error?: string | null
}): LicenseStatus => {
  const parsed = licensePayloadSchema.parse(payload)

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
    })
  } catch (error) {
    if (error instanceof errors.JWTExpired && keyId) {
      try {
        return statusFromPayload({
          state: "expired",
          payload: error.payload,
          keyId,
          currentDate,
          error: error.message,
        })
      } catch (parseError) {
        return invalidStatus(parseError, keyId)
      }
    }

    return invalidStatus(error, keyId)
  }
}

const resolveLicenseFromEnv = (): Promise<LicenseStatus> => {
  const token = keys().LICENSE_KEY?.trim()

  if (!token) {
    return Promise.resolve(missingStatus())
  }

  return verifyLicenseToken(token)
}

export const loadLicense = (): Promise<LicenseStatus> => {
  if (!cachedLicense) {
    cachedLicense = resolveLicenseFromEnv()
  }

  return cachedLicense
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
