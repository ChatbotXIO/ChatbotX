// biome-ignore lint/suspicious/noEmptyBlockStatements: intentional no-op after analytics server removal
export function bootstrapApp(): void {}

let bootstrapPromise: Promise<void> | null = null

export async function ensureBootstrapped(): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = Promise.resolve().then(() => bootstrapApp())
  }

  await bootstrapPromise
}
