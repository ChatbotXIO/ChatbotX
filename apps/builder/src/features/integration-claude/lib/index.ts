import ky from "ky"

export async function verifyClaudeApiKey(apiKey: string) {
  try {
    await ky.get("https://api.anthropic.com/v1/models", {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
    })
    return true
  } catch {
    return false
  }
}
