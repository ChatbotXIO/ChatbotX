import { devicePlatformTypes } from "@chatbotx.io/database/partials"
import { z } from "zod"

export const meResource = z.object({
  id: z.string().describe("The signed-in user's id."),
  name: z.string(),
  email: z.string(),
  image: z.string().nullable(),
  mustChangePassword: z
    .boolean()
    .describe(
      "True while the account still has a provisioned temporary password. Until `me.changePassword` succeeds every other operation answers 403.",
    ),
})

const MIN_PASSWORD_LENGTH = 8
const MAX_PASSWORD_LENGTH = 100

export const changeMyPasswordRequest = z.object({
  currentPassword: z
    .string()
    .min(1)
    .max(MAX_PASSWORD_LENGTH)
    .describe("The password the account has now."),
  newPassword: z
    .string()
    .min(MIN_PASSWORD_LENGTH)
    .max(MAX_PASSWORD_LENGTH)
    .describe(
      `The new password, ${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_LENGTH} characters and different from the current one.`,
    ),
  deviceId: z
    .string()
    .min(1)
    .max(128)
    .optional()
    .describe(
      "Installation id for the fresh refresh token. Defaults to the one on the access token.",
    ),
})

/** Same body as `POST /api/auth/mobile/token`, so the app stores it identically. */
export const mobileTokenResponse = z.object({
  tokenType: z.literal("Bearer"),
  accessToken: z.string(),
  expiresIn: z.number().describe("Seconds until the access token expires."),
  expiresAt: z
    .number()
    .describe("Epoch milliseconds at which the access token expires."),
  refreshToken: z.string(),
  refreshTokenExpiresAt: z
    .number()
    .describe("Epoch milliseconds at which the refresh token expires."),
  deviceId: z.string(),
  mustChangePassword: z.boolean(),
})

export const registerMyDeviceTokenRequest = z.object({
  platform: devicePlatformTypes.describe("Platform of the device."),
  token: z.string().min(1).describe("Expo push token of the device."),
})

export const unregisterMyDeviceTokenRequest = z.object({
  token: z
    .string()
    .min(1)
    .describe(
      "Expo push token to remove, as passed to `me.registerDeviceToken`.",
    ),
})

export const accountDeletionRequest = z.object({
  confirmation: z
    .literal("DELETE")
    .describe('Confirmation phrase. Must be exactly "DELETE".'),
})
