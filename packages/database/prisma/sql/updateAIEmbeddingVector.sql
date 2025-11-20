UPDATE "AIEmbedding"
SET "embedding" = $1::vector, "updatedAt" = $2, "status" = $3
WHERE "id" = $4;
