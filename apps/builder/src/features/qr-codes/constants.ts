export const QR_CODE_SIZE = { DEFAULT: 600, MIN: 64, MAX: 1024 }

const QR_NAME_PREFIX = "qr_"

export function stripQrPrefix(name: string): string {
  return name.startsWith(QR_NAME_PREFIX)
    ? name.slice(QR_NAME_PREFIX.length)
    : name
}
