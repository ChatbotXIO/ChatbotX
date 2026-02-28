import ky from "ky"

export async function verifyDeepSeekApiKey(apiKey: string) {
  try {
    await ky.get("https://api.deepseek.com/models", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })
    return true
  } catch {
    return false
  }
}
