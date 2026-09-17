-- Genera la migration "vera" con:
--   npx prisma migrate dev --create-only --name customer_phone_normalization
-- e incolla questo contenuto nel file generato.
--
-- NON modifica retroattivamente le migration precedenti (001, 002): è una
-- migration nuova e indipendente, come richiesto.

ALTER TABLE "customers"
  ADD COLUMN "normalized_phone" TEXT;

-- Vincolo unique tenant-scoped: NULL non collide mai con altri NULL in
-- Postgres, quindi i clienti senza telefono (o con un numero non valido)
-- restano ammessi senza limiti.
CREATE UNIQUE INDEX "customers_business_id_normalized_phone_key"
  ON "customers" ("business_id", "normalized_phone");

-- BACKFILL: questa migration NON calcola normalized_phone per le righe già
-- esistenti (la normalizzazione E.164 richiede la libreria applicativa
-- libphonenumber-js, non è pratica da esprimere in puro SQL). Se il database
-- ha già clienti reali con un numero salvato, esegui uno script Node one-off
-- che itera i customer con phone non nullo e normalizedPhone nullo,
-- calcola normalizePhoneToE164(phone) e fa l'update — usando la STESSA
-- funzione di src/shared/lib/phone.ts, per garantire coerenza con quanto
-- verrà scritto dall'app d'ora in poi.
-- In fase di sviluppo pre-lancio, senza dati reali, un semplice
-- `prisma migrate reset` è più semplice del backfill.
