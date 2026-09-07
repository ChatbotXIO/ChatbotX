import type { DatabaseClient } from "../../client"
import { db } from "../../client"
import { AiFileEmbeddingRepository } from "./repository"

export function createAiFileEmbeddingRepository(
  client: DatabaseClient = db,
): AiFileEmbeddingRepository {
  return new AiFileEmbeddingRepository(client)
}

export {
  type AiFileEmbeddingChunk,
  AiFileEmbeddingRepository,
  type PendingAiFileEmbedding,
} from "./repository"
