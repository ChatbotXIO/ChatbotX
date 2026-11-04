export const mobileCredentialId = (mobile: {
  user: { id: string }
  deviceId: string | null
  workspace?: { id: string }
}): string =>
  `mobile:${mobile.workspace?.id ? `${mobile.workspace.id}:` : ""}${mobile.user.id}:${mobile.deviceId ?? "-"}`
