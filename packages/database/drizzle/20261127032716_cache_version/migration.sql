CREATE TABLE "CacheVersion" (
	"namespace" text,
	"scopeId" text,
	"version" bigint NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "CacheVersion_pkey" PRIMARY KEY("namespace","scopeId")
);
