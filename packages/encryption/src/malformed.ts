/**
 * The stored encrypted value itself is malformed (odd-length hex, unknown
 * version): it can never be decrypted, whatever key is configured. Distinct
 * from a missing key or a wrong key, which are configuration problems.
 */
export class MalformedEncryptedDataError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MalformedEncryptedDataError"
  }
}

export const isMalformedEncryptedData = (
  error: unknown,
): error is MalformedEncryptedDataError =>
  error instanceof MalformedEncryptedDataError
