import type { Pool } from "pg"
import type { DatabaseClient } from "../../client"
import { logger } from "../../logger"
import { createShardPool } from "../shared"
import { MessageShardRegistry } from "./registry"

export interface ShardMigration {
  description: string
  sql: string
  version: string
}

export class ShardMigrationRunner {
  private readonly registry: MessageShardRegistry

  constructor(mainDb: DatabaseClient) {
    this.registry = new MessageShardRegistry(mainDb)
  }

  async runPendingMigrations(migrations: ShardMigration[]): Promise<void> {
    const sorted = [...migrations].sort((a, b) =>
      a.version.localeCompare(b.version),
    )

    const allShards = await this.registry.listAll()

    if (allShards.length === 0) {
      logger.info("No shards registered — skipping shard migrations")
      return
    }

    for (const shard of allShards) {
      const pool = createShardPool(shard)
      try {
        await this.migrateOneShard(pool, shard.id, shard.name, sorted)
      } catch (error) {
        logger.error(
          { err: error, shardId: shard.id, shardName: shard.name },
          "Shard migration failed",
        )
        throw error
      } finally {
        await pool.end().catch((err) => {
          logger.warn(
            { err, shardId: shard.id },
            "Error closing pool after shard migration",
          )
        })
      }
    }
  }

  private async migrateOneShard(
    pool: Pool,
    shardId: string,
    shardName: string,
    migrations: ShardMigration[],
  ): Promise<void> {
    const currentVersion = await this.getSchemaVersion(pool)
    const pending = migrations.filter((m) => m.version > currentVersion)

    if (pending.length === 0) {
      logger.info(
        { shardId, shardName, version: currentVersion },
        "Shard schema is up to date",
      )
      return
    }

    logger.info(
      { shardId, shardName, currentVersion, pendingCount: pending.length },
      "Applying pending migrations to shard",
    )

    for (const migration of pending) {
      logger.info(
        {
          shardId,
          shardName,
          version: migration.version,
          description: migration.description,
        },
        "Applying shard migration",
      )
      await pool.query(migration.sql)
      await pool.query(
        `UPDATE "_shard_meta" SET "value" = $1, "updatedAt" = now() WHERE "key" = 'schemaVersion'`,
        [migration.version],
      )
      logger.info(
        { shardId, shardName, version: migration.version },
        "Shard migration applied",
      )
    }
  }

  private async getSchemaVersion(pool: Pool): Promise<string> {
    try {
      const result = await pool.query<{ value: string }>(
        `SELECT "value" FROM "_shard_meta" WHERE "key" = 'schemaVersion' LIMIT 1`,
      )
      return result.rows[0]?.value ?? "0.0.0"
    } catch {
      return "0.0.0"
    }
  }
}
