import { generateRandomString, hashPassword } from "better-auth/crypto"

const TEMP_PASSWORD_LENGTH = 16

export const generateTemporaryPassword = async (): Promise<{
  initialPassword: string
  hashedPassword: string
}> => {
  const initialPassword = generateRandomString(
    TEMP_PASSWORD_LENGTH,
    "a-z",
    "A-Z",
    "0-9",
  )

  return {
    initialPassword,
    hashedPassword: await hashPassword(initialPassword),
  }
}
