export const generateRandomId = (): string => {
  return Math.random().toString(36).substring(2, 18)
}

export const getRandomFromZeroToN = (n: number) => {
  return Math.floor(Math.random() * n)
}
