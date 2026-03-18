import { getSpooler } from "./ndjson-spooler-registry"

export async function writeToSpooler(
  eventType: string,
  row: Record<string, unknown>,
): Promise<void> {
  const sp = getSpooler(eventType) as {
    writeEvent: (row: unknown) => Promise<void>
  } | null
  if (!sp) {
    throw new Error("Spooler not initialized")
  }
  await sp.writeEvent(row)
}
