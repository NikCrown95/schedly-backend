-- Da eseguire DOPO la prima `prisma migrate dev`, come migration aggiuntiva
-- (prisma migrate dev --create-only --name appointment_overlap_constraint,
--  poi incollare questo contenuto nel file generato ed eseguire `prisma migrate dev`).
--
-- Garantisce a livello di database che non possano esistere due appuntamenti
-- sovrapposti per la stessa risorsa (business + eventuale staff member),
-- indipendentemente da bug applicativi o race condition concorrenti.
-- Questa è la seconda linea di difesa descritta nella sezione 9 dell'architettura,
-- complementare al controllo applicativo (transazione + ricontrollo disponibilità).

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Consideriamo solo gli appuntamenti "attivi" (non cancellati) ai fini dell'overlap.
-- staff_member_id può essere NULL nell'MVP (single-calendar): in quel caso l'overlap
-- si applica a livello di intero business.
ALTER TABLE appointments
  ADD CONSTRAINT appointments_no_overlap
  EXCLUDE USING gist (
    business_id WITH =,
    COALESCE(staff_member_id, '00000000-0000-0000-0000-000000000000'::uuid) WITH =,
    tstzrange(start_at, end_at, '[)') WITH &&
  )
  WHERE (status NOT IN ('CANCELLED'));
