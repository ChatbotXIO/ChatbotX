ALTER TABLE "Broadcast" ADD COLUMN "integrationMessengerId" bigint;--> statement-breakpoint
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_integrationMessengerId_IntegrationMessenger_id_fkey" FOREIGN KEY ("integrationMessengerId") REFERENCES "IntegrationMessenger"("id") ON DELETE SET NULL ON UPDATE CASCADE;
