CREATE TABLE "jwks" (
	"id" text PRIMARY KEY,
	"publicKey" text NOT NULL,
	"privateKey" text NOT NULL,
	"createdAt" timestamp(6) with time zone NOT NULL,
	"expiresAt" timestamp(6) with time zone
);
