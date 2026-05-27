declare global {
  interface Window {
    __ENV?: Record<string, string | undefined>
  }
}

/**
 * Reads a NEXT_PUBLIC_* variable from window.__ENV (injected at request time
 * by PublicEnvScript) on the client, and from process.env on the server.
 * This allows env vars to be overridden at container runtime without a rebuild.
 */
export function clientEnv(key: string): string | undefined {
  if (typeof window !== "undefined") {
    return window.__ENV?.[key]
  }
  return process.env[key]
}
