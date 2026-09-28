import { afterEach, describe, expect, test } from "vitest"
import { quotaEnforcementEnv } from "../src/quota-enforcement/keys"

const originalQuotaMacAdmission = process.env.QUOTA_MAC_ADMISSION
const originalSkipEnvCheck = process.env.SKIP_ENV_CHECK

afterEach(() => {
  if (originalQuotaMacAdmission === undefined) {
    delete process.env.QUOTA_MAC_ADMISSION
  } else {
    process.env.QUOTA_MAC_ADMISSION = originalQuotaMacAdmission
  }
  if (originalSkipEnvCheck === undefined) {
    delete process.env.SKIP_ENV_CHECK
  } else {
    process.env.SKIP_ENV_CHECK = originalSkipEnvCheck
  }
})

describe("quotaEnforcementEnv", () => {
  test("defaults an unset strategy to atomic when validation is skipped", () => {
    process.env.SKIP_ENV_CHECK = "true"
    delete process.env.QUOTA_MAC_ADMISSION

    expect(quotaEnforcementEnv().QUOTA_MAC_ADMISSION).toBe("atomic")
  })

  test("preserves lock when validation is skipped", () => {
    process.env.SKIP_ENV_CHECK = "true"
    process.env.QUOTA_MAC_ADMISSION = "lock"

    expect(quotaEnforcementEnv().QUOTA_MAC_ADMISSION).toBe("lock")
  })
})
