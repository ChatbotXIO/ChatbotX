export const calculateExpiresAt = (expiresIn: number): string => {
  const now = new Date()
  const expiresAt = new Date(now.getTime() + expiresIn * 1000)

  return expiresAt.toISOString()
}
