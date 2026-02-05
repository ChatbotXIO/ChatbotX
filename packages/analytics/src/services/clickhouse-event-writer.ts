import { clickhouse } from "../client"
import type { EventRow, EventWriter } from "./event-writer-factory"

export class ClickhouseEventWriter implements EventWriter {
  async insert(table: string, rows: EventRow[]): Promise<void> {
    if (rows.length === 0) {
      return
    }

    await clickhouse.insert({
      table,
      values: rows,
      format: "JSONEachRow",
    })
  }

  async insertOne(table: string, row: EventRow): Promise<void> {
    await this.insert(table, [row])
  }
}

export const clickhouseEventWriter = new ClickhouseEventWriter()
