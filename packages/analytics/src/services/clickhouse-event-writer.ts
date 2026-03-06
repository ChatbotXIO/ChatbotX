import { clickhouse } from "@aha.chat/database/clickhouse/client"
import type { EventRow, EventWriter } from "./event-writer-factory"

const MAX_RETRIES = 3
const BASE_DELAY_MS = 500

export class ClickhouseEventWriter implements EventWriter {
  async insert(table: string, rows: EventRow[]): Promise<void> {
    if (rows.length === 0) {
      return
    }

    let lastError: unknown
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        await clickhouse.insert({
          table,
          values: rows,
          format: "JSONEachRow",
        })
        return
      } catch (error) {
        lastError = error
        if (attempt < MAX_RETRIES - 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, BASE_DELAY_MS * 2 ** attempt),
          )
        }
      }
    }

    throw lastError
  }

  async insertOne(table: string, row: EventRow): Promise<void> {
    await this.insert(table, [row])
  }
}

export const clickhouseEventWriter = new ClickhouseEventWriter()
