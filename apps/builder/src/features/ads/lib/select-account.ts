export function resolveSelectedIntegration<T extends { id: string }>(
  integrations: readonly T[],
  accountParam: string,
): T | null {
  return (
    integrations.find((integration) => integration.id === accountParam) ??
    integrations[0] ??
    null
  )
}
