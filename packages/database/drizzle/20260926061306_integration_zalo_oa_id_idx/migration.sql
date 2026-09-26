CREATE INDEX CONCURRENTLY IF NOT EXISTS "IntegrationZalo_oaId_idx" ON "IntegrationZalo" USING btree ("oaId" ASC NULLS LAST);
