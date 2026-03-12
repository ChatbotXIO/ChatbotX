export const hasTlsSelfSignedCause = (error: unknown): boolean => {
  let current: unknown = error

  while (current && typeof current === "object") {
    const code =
      "code" in current && typeof current.code === "string"
        ? current.code
        : undefined

    if (code === "SELF_SIGNED_CERT_IN_CHAIN") {
      return true
    }

    current = "cause" in current ? current.cause : undefined
  }

  return false
}
