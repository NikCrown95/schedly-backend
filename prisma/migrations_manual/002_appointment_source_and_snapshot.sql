-- Da usare SOLO se hai già applicato le migration precedenti su un database che
-- vuoi conservare. Se stai ancora sviluppando e puoi permetterti di ripartire da
-- zero, è più semplice eseguire `npx prisma migrate reset` e poi
-- `npx prisma migrate dev --name init` (che include già questi campi nello
-- schema.prisma aggiornato) invece di applicare questo file a mano.
--
-- Genera comunque la migration "vera" con:
--   npx prisma migrate dev --create-only --name add_appointment_source_and_snapshot
-- e incolla questo contenuto nel file generato, così resta versionata insieme
-- alle altre.

CREATE TYPE "AppointmentSource" AS ENUM ('WEBSITE', 'WHATSAPP', 'ADMIN');

ALTER TABLE "appointments"
  ADD COLUMN "source" "AppointmentSource" NOT NULL DEFAULT 'WEBSITE',
  ADD COLUMN "price_cents" INTEGER,
  ADD COLUMN "duration_minutes" INTEGER;

-- Backfill per righe già esistenti: copia i valori correnti dal Service.
-- Dopo il backfill le due colonne diventano NOT NULL, perché ogni nuovo
-- appuntamento le valorizza sempre in fase di creazione.
UPDATE "appointments" a
SET "price_cents" = s."price_cents",
    "duration_minutes" = s."duration_minutes"
FROM "services" s
WHERE a."service_id" = s.id AND a."price_cents" IS NULL;

ALTER TABLE "appointments"
  ALTER COLUMN "price_cents" SET NOT NULL,
  ALTER COLUMN "duration_minutes" SET NOT NULL;
