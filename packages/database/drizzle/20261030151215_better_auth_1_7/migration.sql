ALTER TABLE "Verification" ALTER COLUMN "id" TYPE text USING "id"::text;--> statement-breakpoint
CREATE INDEX "Verification_identifier_idx" ON "Verification" ("identifier");--> statement-breakpoint

ALTER TABLE "Jwk" ADD COLUMN "alg" text;--> statement-breakpoint
ALTER TABLE "Jwk" ADD COLUMN "crv" text;--> statement-breakpoint

DROP TABLE "OAuthAccessToken";--> statement-breakpoint

ALTER TABLE "OAuthApplication" RENAME TO "OAuthClient";--> statement-breakpoint
ALTER TABLE "OAuthClient" RENAME CONSTRAINT "OAuthApplication_pkey" TO "OAuthClient_pkey";--> statement-breakpoint
ALTER TABLE "OAuthClient" RENAME CONSTRAINT "OAuthApplication_userId_User_id_fkey" TO "OAuthClient_userId_User_id_fkey";--> statement-breakpoint
ALTER TABLE "OAuthConsent" RENAME CONSTRAINT "OAuthConsent_clientId_OAuthApplication_clientId_fkey" TO "OAuthConsent_clientId_OAuthClient_clientId_fkey";--> statement-breakpoint
ALTER INDEX "OAuthApplication_clientId_key" RENAME TO "OAuthClient_clientId_key";--> statement-breakpoint
ALTER INDEX "OAuthApplication_userId_idx" RENAME TO "OAuthClient_userId_idx";--> statement-breakpoint
ALTER TABLE "OAuthClient" ADD COLUMN "clientDiscoveryId" text;--> statement-breakpoint
ALTER TABLE "OAuthClient" ADD COLUMN "skipConsent" boolean;--> statement-breakpoint
ALTER TABLE "OAuthClient" ADD COLUMN "enableEndSession" boolean;--> statement-breakpoint
ALTER TABLE "OAuthClient" ADD COLUMN "subjectType" text;--> statement-breakpoint
ALTER TABLE "OAuthClient" ADD COLUMN "scopes" text[];--> statement-breakpoint
ALTER TABLE "OAuthClient" ADD COLUMN "clientCredentialsScopes" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "OAuthClient" ADD COLUMN "uri" text;--> statement-breakpoint
ALTER TABLE "OAuthClient" ADD COLUMN "contacts" text[];--> statement-breakpoint
ALTER TABLE "OAuthClient" ADD COLUMN "tos" text;--> statement-breakpoint
ALTER TABLE "OAuthClient" ADD COLUMN "policy" text;--> statement-breakpoint
ALTER TABLE "OAuthClient" ADD COLUMN "softwareId" text;--> statement-breakpoint
ALTER TABLE "OAuthClient" ADD COLUMN "softwareVersion" text;--> statement-breakpoint
ALTER TABLE "OAuthClient" ADD COLUMN "softwareStatement" text;--> statement-breakpoint
ALTER TABLE "OAuthClient" ADD COLUMN "redirectUris" text[];--> statement-breakpoint
ALTER TABLE "OAuthClient" ADD COLUMN "postLogoutRedirectUris" text[];--> statement-breakpoint
ALTER TABLE "OAuthClient" ADD COLUMN "backchannelLogoutUri" text;--> statement-breakpoint
ALTER TABLE "OAuthClient" ADD COLUMN "backchannelLogoutSessionRequired" boolean;--> statement-breakpoint
ALTER TABLE "OAuthClient" ADD COLUMN "tokenEndpointAuthMethod" text;--> statement-breakpoint
ALTER TABLE "OAuthClient" ADD COLUMN "applicationType" text;--> statement-breakpoint
ALTER TABLE "OAuthClient" ADD COLUMN "jwks" text;--> statement-breakpoint
ALTER TABLE "OAuthClient" ADD COLUMN "jwksUri" text;--> statement-breakpoint
ALTER TABLE "OAuthClient" ADD COLUMN "grantTypes" text[];--> statement-breakpoint
ALTER TABLE "OAuthClient" ADD COLUMN "responseTypes" text[];--> statement-breakpoint
ALTER TABLE "OAuthClient" ADD COLUMN "requirePKCE" boolean;--> statement-breakpoint
ALTER TABLE "OAuthClient" ADD COLUMN "dpopBoundAccessTokens" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "OAuthClient" ADD COLUMN "referenceId" text;--> statement-breakpoint

CREATE FUNCTION "__oauth_metadata"(value text) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
  IF value IS NULL OR btrim(value) = '' THEN
    RETURN NULL;
  END IF;
  BEGIN
    RETURN value::jsonb;
  EXCEPTION WHEN others THEN
    RETURN jsonb_build_object('legacy', value);
  END;
END;
$$;--> statement-breakpoint
-- Better Auth 1.6 stored `redirectUrls` comma-joined, public clients with an
-- empty-string secret, and confidential secrets in plaintext. 1.7 expects a
-- text[] of URIs, a NULL secret for public clients, and a SHA-256 base64url
-- hash (its default `storeClientSecret: "hashed"`) for confidential ones.
UPDATE "OAuthClient" SET
  "redirectUris" = ARRAY(
    SELECT btrim(uri)
    FROM unnest(string_to_array("redirectUrls", ',')) AS uri
    WHERE btrim(uri) <> ''
  ),
  "tokenEndpointAuthMethod" = CASE WHEN COALESCE("clientSecret", '') = '' THEN 'none' ELSE 'client_secret_basic' END,
  "applicationType" = CASE WHEN "type" IN ('web', 'native') THEN "type" ELSE 'web' END,
  "grantTypes" = ARRAY['authorization_code', 'refresh_token']::text[],
  "responseTypes" = ARRAY['code']::text[],
  "requirePKCE" = true,
  "clientSecret" = CASE
    WHEN COALESCE("clientSecret", '') = '' THEN NULL
    ELSE translate(rtrim(encode(sha256(convert_to("clientSecret", 'UTF8')), 'base64'), '='), '+/', '-_')
  END;--> statement-breakpoint
ALTER TABLE "OAuthClient" ALTER COLUMN "metadata" TYPE jsonb USING "__oauth_metadata"("metadata");--> statement-breakpoint
DROP FUNCTION "__oauth_metadata"(text);--> statement-breakpoint
ALTER TABLE "OAuthClient" ALTER COLUMN "redirectUris" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "OAuthClient" ALTER COLUMN "name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "OAuthClient" DROP COLUMN "redirectUrls";--> statement-breakpoint
ALTER TABLE "OAuthClient" DROP COLUMN "type";--> statement-breakpoint

DELETE FROM "OAuthConsent" WHERE "consentGiven" = false;--> statement-breakpoint
ALTER TABLE "OAuthConsent" ADD COLUMN "referenceId" text;--> statement-breakpoint
ALTER TABLE "OAuthConsent" ADD COLUMN "resources" text[];--> statement-breakpoint
ALTER TABLE "OAuthConsent" ADD COLUMN "requestedUserInfoClaims" text[];--> statement-breakpoint
ALTER TABLE "OAuthConsent" ALTER COLUMN "scopes" TYPE text[] USING CASE WHEN btrim("scopes") = '' THEN ARRAY[]::text[] ELSE regexp_split_to_array(btrim("scopes"), '\s+') END;--> statement-breakpoint
ALTER TABLE "OAuthConsent" ALTER COLUMN "userId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "OAuthConsent" DROP COLUMN "consentGiven";--> statement-breakpoint

CREATE TABLE "OAuthClientAssertion" (
  "id" text PRIMARY KEY,
  "expiresAt" timestamp(6) with time zone NOT NULL
);--> statement-breakpoint
CREATE TABLE "OAuthResource" (
  "id" bigint PRIMARY KEY,
  "createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
  "identifier" text NOT NULL,
  "name" text NOT NULL,
  "accessTokenTtl" integer,
  "refreshTokenTtl" integer,
  "signingAlgorithm" text,
  "signingKeyId" text,
  "allowedScopes" text[],
  "customClaims" jsonb,
  "dpopBoundAccessTokensRequired" boolean DEFAULT false NOT NULL,
  "disabled" boolean DEFAULT false NOT NULL,
  "policyVersion" integer DEFAULT 1 NOT NULL,
  "metadata" jsonb
);--> statement-breakpoint
CREATE TABLE "OAuthClientResource" (
  "id" bigint PRIMARY KEY,
  "createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
  "clientId" text NOT NULL,
  "resourceId" text NOT NULL,
  "metadata" jsonb
);--> statement-breakpoint
CREATE TABLE "OAuthRefreshToken" (
  "id" bigint PRIMARY KEY,
  "createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
  "token" text NOT NULL,
  "clientId" text NOT NULL,
  "sessionId" bigint,
  "userId" bigint NOT NULL,
  "referenceId" text,
  "authorizationCodeId" text,
  "resources" text[],
  "requestedUserInfoClaims" text[],
  "expiresAt" timestamp(6) with time zone NOT NULL,
  "revoked" timestamp(6) with time zone,
  "rotatedAt" timestamp(6) with time zone,
  "rotationReplayResponse" text,
  "rotationReplayExpiresAt" timestamp(6) with time zone,
  "authTime" timestamp(6) with time zone,
  "confirmation" jsonb,
  "scopes" text[] NOT NULL
);--> statement-breakpoint
CREATE TABLE "OAuthAccessToken" (
  "id" bigint PRIMARY KEY,
  "createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
  "token" text NOT NULL,
  "clientId" text NOT NULL,
  "sessionId" bigint,
  "userId" bigint,
  "referenceId" text,
  "authorizationCodeId" text,
  "resources" text[],
  "requestedUserInfoClaims" text[],
  "refreshId" bigint,
  "expiresAt" timestamp(6) with time zone NOT NULL,
  "revoked" timestamp(6) with time zone,
  "confirmation" jsonb,
  "scopes" text[] NOT NULL
);--> statement-breakpoint

CREATE INDEX "OAuthClientAssertion_expiresAt_idx" ON "OAuthClientAssertion" ("expiresAt");--> statement-breakpoint
CREATE UNIQUE INDEX "OAuthResource_identifier_key" ON "OAuthResource" ("identifier");--> statement-breakpoint
CREATE INDEX "OAuthResource_disabled_idx" ON "OAuthResource" ("disabled");--> statement-breakpoint
CREATE INDEX "OAuthClientResource_clientId_idx" ON "OAuthClientResource" ("clientId");--> statement-breakpoint
CREATE INDEX "OAuthClientResource_resourceId_idx" ON "OAuthClientResource" ("resourceId");--> statement-breakpoint
CREATE UNIQUE INDEX "OAuthClientResource_clientId_resourceId_key" ON "OAuthClientResource" ("clientId","resourceId");--> statement-breakpoint
CREATE UNIQUE INDEX "OAuthRefreshToken_token_key" ON "OAuthRefreshToken" ("token");--> statement-breakpoint
CREATE INDEX "OAuthRefreshToken_clientId_idx" ON "OAuthRefreshToken" ("clientId");--> statement-breakpoint
CREATE INDEX "OAuthRefreshToken_sessionId_idx" ON "OAuthRefreshToken" ("sessionId");--> statement-breakpoint
CREATE INDEX "OAuthRefreshToken_userId_idx" ON "OAuthRefreshToken" ("userId");--> statement-breakpoint
CREATE INDEX "OAuthRefreshToken_authorizationCodeId_idx" ON "OAuthRefreshToken" ("authorizationCodeId");--> statement-breakpoint
CREATE UNIQUE INDEX "OAuthAccessToken_token_key" ON "OAuthAccessToken" ("token");--> statement-breakpoint
CREATE INDEX "OAuthAccessToken_clientId_idx" ON "OAuthAccessToken" ("clientId");--> statement-breakpoint
CREATE INDEX "OAuthAccessToken_sessionId_idx" ON "OAuthAccessToken" ("sessionId");--> statement-breakpoint
CREATE INDEX "OAuthAccessToken_userId_idx" ON "OAuthAccessToken" ("userId");--> statement-breakpoint
CREATE INDEX "OAuthAccessToken_authorizationCodeId_idx" ON "OAuthAccessToken" ("authorizationCodeId");--> statement-breakpoint
CREATE INDEX "OAuthAccessToken_refreshId_idx" ON "OAuthAccessToken" ("refreshId");--> statement-breakpoint

ALTER TABLE "OAuthClientResource" ADD CONSTRAINT "OAuthClientResource_clientId_OAuthClient_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "OAuthClient"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "OAuthClientResource" ADD CONSTRAINT "OAuthClientResource_resourceId_OAuthResource_identifier_fkey" FOREIGN KEY ("resourceId") REFERENCES "OAuthResource"("identifier") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "OAuthRefreshToken" ADD CONSTRAINT "OAuthRefreshToken_clientId_OAuthClient_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "OAuthClient"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "OAuthRefreshToken" ADD CONSTRAINT "OAuthRefreshToken_sessionId_Session_id_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "OAuthRefreshToken" ADD CONSTRAINT "OAuthRefreshToken_userId_User_id_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "OAuthAccessToken" ADD CONSTRAINT "OAuthAccessToken_clientId_OAuthClient_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "OAuthClient"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "OAuthAccessToken" ADD CONSTRAINT "OAuthAccessToken_sessionId_Session_id_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "OAuthAccessToken" ADD CONSTRAINT "OAuthAccessToken_userId_User_id_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "OAuthAccessToken" ADD CONSTRAINT "OAuthAccessToken_refreshId_OAuthRefreshToken_id_fkey" FOREIGN KEY ("refreshId") REFERENCES "OAuthRefreshToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;