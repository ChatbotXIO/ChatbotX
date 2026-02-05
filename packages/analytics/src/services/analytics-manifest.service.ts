import { prisma } from "@aha.chat/database"
import { uploader } from "@aha.chat/filesystem"
import type { NdjsonIngestManifestStore } from "@aha.chat/filesystem/server"

export class AnalyticsManifestService implements NdjsonIngestManifestStore {
  async getS3Files(prefix: string): Promise<string[]> {
    const objects = await uploader.listObjects(prefix)
    return objects.map((obj) => obj.Key).filter((key): key is string => !!key)
  }

  async filterUnprocessedFiles(s3Keys: string[]): Promise<string[]> {
    if (s3Keys.length === 0) {
      return []
    }

    const processed = await prisma.analyticsManifestStatus.findMany({
      where: {
        objectKey: { in: s3Keys },
        status: "ingested",
      },
      select: { objectKey: true },
    })

    const processedSet = new Set(processed.map((p) => p.objectKey))
    return s3Keys.filter((key) => !processedSet.has(key))
  }

  filterNotIngested(objectKeys: string[]): Promise<string[]> {
    return this.filterUnprocessedFiles(objectKeys)
  }

  async claimForProcessing(objectKey: string): Promise<number | null> {
    try {
      const existing = await prisma.analyticsManifestStatus.findUnique({
        where: { objectKey },
      })

      if (
        existing?.status === "processing" ||
        existing?.status === "ingested"
      ) {
        return null
      }

      const result = await prisma.analyticsManifestStatus.upsert({
        where: { objectKey },
        create: {
          objectKey,
          status: "processing",
          attempts: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        update: {
          status: "processing",
          attempts: { increment: 1 },
          updatedAt: new Date(),
        },
      })

      return result.attempts
    } catch (error) {
      console.error("[AnalyticsManifestService] Failed to claim", {
        objectKey,
        error,
      })
      return null
    }
  }

  async markIngested(objectKey: string): Promise<void> {
    await prisma.analyticsManifestStatus.update({
      where: { objectKey },
      data: {
        status: "ingested",
        ingestedAt: new Date(),
        updatedAt: new Date(),
      },
    })
  }

  async markFailed(objectKey: string, error: string): Promise<void> {
    await prisma.analyticsManifestStatus.update({
      where: { objectKey },
      data: {
        status: "failed",
        lastError: error,
        updatedAt: new Date(),
      },
    })
  }

  async deleteS3File(objectKey: string): Promise<void> {
    try {
      await uploader.deleteObject(objectKey)
    } catch (error) {
      console.error("[AnalyticsManifestService] Failed to delete S3 file", {
        objectKey,
        error,
      })
    }
  }

  async resetStuckProcessing(olderThanMinutes = 30): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000)
    const result = await prisma.analyticsManifestStatus.updateMany({
      where: {
        status: "processing",
        updatedAt: { lt: cutoff },
      },
      data: {
        status: "failed",
        lastError: "Processing timeout - reset by cleanup job",
        updatedAt: new Date(),
      },
    })
    return result.count
  }
}

export const analyticsManifestService = new AnalyticsManifestService()
