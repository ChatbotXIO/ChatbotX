export const mobileCredentialId = (mobile: {
  user: { id: string }
  deviceId: string | null
}): string => `mobile:${mobile.user.id}:${mobile.deviceId ?? "-"}`
