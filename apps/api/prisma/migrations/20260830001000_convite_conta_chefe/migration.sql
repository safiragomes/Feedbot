CREATE TABLE "ConviteContaChefe" (
    "id" TEXT NOT NULL,
    "monitorId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "usadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConviteContaChefe_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConviteContaChefe_monitorId_key" ON "ConviteContaChefe"("monitorId");
CREATE UNIQUE INDEX "ConviteContaChefe_email_key" ON "ConviteContaChefe"("email");
CREATE UNIQUE INDEX "ConviteContaChefe_tokenHash_key" ON "ConviteContaChefe"("tokenHash");
CREATE INDEX "ConviteContaChefe_expiraEm_idx" ON "ConviteContaChefe"("expiraEm");

ALTER TABLE "ConviteContaChefe" ADD CONSTRAINT "ConviteContaChefe_monitorId_fkey"
FOREIGN KEY ("monitorId") REFERENCES "Monitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
