-- DropIndex
DROP INDEX "Session_sessionToken_key";

-- AlterTable
ALTER TABLE
  "Account" RENAME COLUMN "access_token" TO "accessToken";

ALTER TABLE
  "Account" RENAME COLUMN "expires_at" TO "accessTokenExpiresAt";

ALTER TABLE
  "Account" RENAME COLUMN "id_token" TO "idToken";

ALTER TABLE
  "Account" RENAME COLUMN "refresh_token" TO "refreshToken";

ALTER TABLE
  "Account" RENAME COLUMN "provider" TO "providerId";

ALTER TABLE
  "Account" RENAME COLUMN "providerAccountId" TO "accountId";

ALTER TABLE
  "Account" DROP CONSTRAINT "Account_pkey",
ADD
  COLUMN "refreshTokenExpiresAt" TIMESTAMP(3),
ADD
  COLUMN "id" TEXT NOT NULL,
ADD
  COLUMN "password" TEXT,
  DROP COLUMN "session_state",
  DROP COLUMN "token_type",
  DROP COLUMN "type",
ADD
  CONSTRAINT "Account_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE
  "Session" DROP COLUMN "expires",
  DROP COLUMN "sessionToken",
ADD
  COLUMN "expiresAt" TIMESTAMP(3) NOT NULL,
ADD
  COLUMN "id" TEXT NOT NULL,
ADD
  COLUMN "ipAddress" TEXT,
ADD
  COLUMN "token" TEXT NOT NULL,
ADD
  COLUMN "userAgent" TEXT,
ADD
  CONSTRAINT "Session_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE
  "User" DROP COLUMN "emailVerified",
ADD
  COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE
  "VerificationToken" RENAME COLUMN "expires" TO "expiresAt";

ALTER TABLE
  "VerificationToken" RENAME COLUMN "token" TO "value";

ALTER TABLE
  "VerificationToken" DROP CONSTRAINT "VerificationToken_pkey",
ADD
  COLUMN "id" TEXT NOT NULL,
ADD
  COLUMN "createdAt" TIMESTAMP(3),
ADD
  COLUMN "updatedAt" TIMESTAMP(3),
ADD
  CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");