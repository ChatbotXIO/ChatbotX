import ky from "ky"

export async function verifyGeminiApiKey(apiKey: string) {
  try {
    await ky.get(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
    )
    return true
  } catch {
    return false
  }
}
