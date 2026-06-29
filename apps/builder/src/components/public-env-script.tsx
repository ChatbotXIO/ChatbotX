const PUBLIC_ENV_KEYS = [
  "NEXT_PUBLIC_BUILDER_URL",
  "NEXT_PUBLIC_BROKER_URL",
  "NEXT_PUBLIC_EDITION",
  "NEXT_PUBLIC_INTERNAL_WS_URL",
  "NEXT_PUBLIC_INTERNAL_STORAGE_URL",
  "NEXT_PUBLIC_STORAGE_URL",
  "NEXT_PUBLIC_ENABLE_PANCAKE_CHAT",
] as const

export function PublicEnvScript() {
  const env: Record<string, string | undefined> = {}
  for (const key of PUBLIC_ENV_KEYS) {
    env[key] = process.env[key]
  }
  return (
    <script
      // biome-ignore lint/security/noDangerouslySetInnerHtml: inject env to window
      dangerouslySetInnerHTML={{
        __html: `window.__ENV=${JSON.stringify(env)}`,
      }}
    />
  )
}
