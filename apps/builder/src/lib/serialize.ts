export async function safeJsonParse(request: Request) {
  try {
    return await request.json()
  } catch {
    return {}
  }
}
