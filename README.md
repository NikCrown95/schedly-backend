# Schedly — Backend

Backend multi-tenant per Schedly, piattaforma SaaS di prenotazione appuntamenti.

> Stato: **Fase 11 e 12 completate** — test di integrazione sui flussi critici,
> immagine Docker di produzione multi-stage, guida al deployment.
> **Tutte le fasi dell'MVP sono completate** (vedi roadmap in fondo).
>
> **Aggiornamento post-MVP**: aggiunti `source` (WEBSITE/WHATSAPP/ADMIN) e lo
> snapshot di prezzo/durata sugli appuntamenti — vedi sezione dedicata subito
> sotto.

## Source e snapshot prezzo/durata sugli appuntamenti

Due correzioni emerse confrontando il backend con un prototipo frontend dello
stesso prodotto:

- **`source`** (`WEBSITE` | `WHATSAPP` | `ADMIN`) — traccia da quale canale è
  arrivato l'appuntamento. L'endpoint autenticato (`POST /appointments`) lo forza
  sempre a `ADMIN` lato server, ignorando qualsiasi valore inviato dal client.
  L'endpoint pubblico (`POST /public/:slug/appointments`) accetta `WEBSITE`
  (default) o `WHATSAPP`, pensato per un futuro agente che prenota per conto del
  cliente attraverso la stessa API pubblica — `ADMIN` non è mai raggiungibile da lì.
- **Snapshot di `priceCents`/`durationMinutes`** — copiati dal `Service` al
  momento della creazione e non più letti dinamicamente in seguito. Se il
  titolare cambia prezzo o durata di un servizio, gli appuntamenti già creati
  restano corretti così com'erano al momento della prenotazione — necessario per
  un incasso storico affidabile. Come conseguenza, anche il **reschedule** ora
  ricalcola `endAt` dalla durata *storica* dell'appuntamento, non da quella
  corrente del servizio (era un bug latente prima di questa modifica).

Se hai già un database con le migration precedenti applicate, vedi
`prisma/migrations_manual/002_appointment_source_and_snapshot.sql` per il
backfill; altrimenti un semplice `prisma migrate reset` con lo schema aggiornato
è sufficiente in fase di sviluppo.

## Security hardening (Fase 10)

- **Helmet** — header di sicurezza standard (X-Content-Type-Options, X-Frame-Options,
  HSTS, Referrer-Policy). CSP disabilitata di proposito: l'API serve solo JSON tranne
  `/docs` (Swagger UI), e una CSP di default rischierebbe di romperla senza aggiungere
  protezione reale a un'API JSON.
- **Rate limit su Redis** invece che in-memory — necessario perché l'app è pensata per
  girare su più istanze; un limite in-memory per singolo processo non protegge l'API
  nel suo insieme quando scalata orizzontalmente.
- **Lockout account-level sul login** (`login-attempt-guard.ts`, Redis): dopo 5 tentativi
  falliti su una stessa email in 15 minuti, l'account viene bloccato temporaneamente
  — protezione complementare al rate limit per-IP, efficace anche contro tentativi
  distribuiti su più IP.
- CORS con whitelist di metodi espliciti.

Checklist sicurezza già coperta nelle fasi precedenti (sezione 23 dell'architettura):
password hashing (argon2id), JWT access+refresh con rotazione, tenant isolation via
`tenantGuard` (mai un `business_id` letto da input esterno), validazione input su
ogni endpoint (Zod), rate limiting per-rotta su auth/public, verifica firma webhook,
error handler che non espone stack trace/query SQL in produzione, redazione di
password/token nei log.

## Abbonamenti e pagamenti (Fase 9)

```
GET    /subscription                 [auth, tenant, owner-only]
POST   /subscription/checkout        [auth, tenant, owner-only]  { plan: "PRO"|"BUSINESS" } → { checkoutUrl }
POST   /subscription/cancel          [auth, tenant, owner-only]  cancel-at-period-end

POST   /webhooks/stripe              pubblico, verificato via firma HMAC (Stripe-Signature)
```

- I price ID Stripe sono configurabili via env (`STRIPE_PRICE_ID_PRO`, `STRIPE_PRICE_ID_BUSINESS`),
  mai hardcoded.
- Il webhook usa il **body grezzo** (Buffer) per la verifica della firma — gestito con
  un content-type parser dedicato in `app.ts` che lascia il JSON normale per tutte
  le altre rotte.
- **Idempotenza**: ogni evento Stripe viene registrato in `WebhookEvent` con `eventId`
  univoco; una consegna duplicata (comune con i webhook) viene riconosciuta dal
  conflitto di unique constraint e ignorata silenziosamente, senza doppio processing.
- Eventi gestiti: `checkout.session.completed`, `customer.subscription.updated/created/deleted`,
  `invoice.payment_failed/succeeded`. Un evento non gestito viene loggato e ignorato,
  mai un errore.
- La cancellazione lato owner è "at period end": lo stato definitivo viene comunque
  confermato dal webhook `customer.subscription.deleted`, mai impostato otticamente
  lato API.

## Notifiche (Fase 8)

Provider scelto: **Resend**, via chiamata HTTP diretta (`fetch`, nessuna libreria
aggiuntiva). Se `EMAIL_PROVIDER_API_KEY` non è configurata (es. sviluppo locale),
il sistema degrada automaticamente a solo-log invece di fallire.

Template disponibili: `auth.verify_email`, `auth.password_reset`, `appointment.created`,
`appointment.cancelled` — un evento non mappato usa un template generico di fallback,
così l'invio non si blocca mai per un modulo futuro che dimentica di registrarne uno.

SMS/WhatsApp/push restano predisposti architetturalmente (stesso `sendNotification`)
ma non ancora implementati — nessun modulo chiamante dovrà cambiare quando verranno
aggiunti.

## Endpoint disponibili (Fase 7)

```
...precedenti (auth, /me, /business, /services, /availability, /customers, /appointments)...

GET    /public/:slug                                    business info pubblica
GET    /public/:slug/services                            servizi attivi
GET    /public/:slug/availability?date=&serviceId=       slot disponibili (stesso motore di Fase 4)
POST   /public/:slug/appointments                        crea prenotazione (find-or-create cliente)
POST   /public/:slug/appointments/:id/cancel             cancellazione cliente (verifica email/telefono)
```

Anti-abuso sulle rotte pubbliche: rate limit dedicato (60/min lettura, 10/min scrittura,
oltre al rate limit globale), e uno slug con business SUSPENDED/ONBOARDING o senza
abbonamento attivo/trial restituisce lo stesso 404 di uno slug inesistente
(anti-enumeration, sezione 11 e 23).

La cancellazione lato cliente richiede email o telefono corrispondenti alla
prenotazione ed è permessa solo fino a `PUBLIC_CANCELLATION_MIN_HOURS` (env,
default 24h) prima dell'appuntamento — configurabile senza toccare il codice.

**Anti-doppia-prenotazione** (Fase 6, riusata identica dal flusso pubblico): controllo
applicativo in transazione + exclusion constraint DB (`appointments_no_overlap`) come
rete di sicurezza contro le race condition.

## Stack

- Node.js 20+ / TypeScript
- Fastify
- PostgreSQL + Prisma ORM
- Redis (rate limiting, lock temporanei)
- Stripe (billing)
- Vitest (test)

## Requisiti

- Node.js >= 20
- Docker + Docker Compose

## Installazione

```bash
npm install
cp .env.example .env
```

Modifica `.env` con i tuoi valori (in locale i default di `docker-compose.yml` funzionano già).

## Avvio ambiente locale

```bash
docker compose up -d postgres redis
```

## Database

```bash
npm run prisma:migrate        # applica le migration (crea prisma/migrations/)
npm run prisma:generate       # rigenera il client Prisma
```

Dopo la prima migration, applica anche la exclusion constraint anti-doppia-prenotazione:

```bash
npx prisma migrate dev --create-only --name appointment_overlap_constraint
# copia il contenuto di prisma/migrations_manual/001_appointment_overlap_constraint.sql
# nel file di migration appena generato, poi:
npx prisma migrate dev
```

## Seed

```bash
npm run prisma:seed
```

Crea un business demo (`demo-salon`) con owner `demo@schedly.app` / `password123`.

## Sviluppo

```bash
npm run dev
```

Server su `http://localhost:3000`, documentazione OpenAPI su `/docs`.

## Test

```bash
docker compose up -d postgres redis   # richiesto: l'app registra il rate limit su Redis all'avvio
npm test
```

### Test di integrazione (Fase 11)

I test in `tests/` (unitari) mockano DB e dipendenze esterne per isolare la logica
di business. I test in `tests/integration/` girano invece contro un **vero Postgres
di test** e coprono i due flussi più critici indicati in sezione 26 dell'architettura:

- **isolamento tenant** — un business non può leggere/listare risorse di un altro,
  nemmeno conoscendone l'ID esatto;
- **race condition reale** sulla doppia prenotazione — due richieste concorrenti
  sullo stesso slot, verificando che l'exclusion constraint DB (non solo il
  controllo applicativo) ne rifiuti esattamente una.

Setup:

```bash
cp .env.test.example .env.test
# crea il database di test, es.: createdb schedly_test (o via docker exec psql)
DATABASE_URL="postgresql://schedly:schedly@localhost:5432/schedly_test?schema=public" \
  npx prisma migrate deploy
npm run test:integration
```

Il setup (`tests/integration/setup.ts`) fa `TRUNCATE` di tutte le tabelle prima di
ogni test — **non puntare mai `.env.test` al database di sviluppo o produzione**.

## Deployment (Fase 12)

### Build immagine di produzione

```bash
docker build -t schedly-backend .
```

Il `Dockerfile` è multi-stage: build e `devDependencies` restano fuori dall'immagine
finale, che gira come utente non-root ed espone un healthcheck su `/health`.

### Migration in produzione

Le migration vanno applicate **come step separato del deploy**, non automaticamente
all'avvio del container — evita race condition quando si scala a più repliche
contemporaneamente:

```bash
DATABASE_URL="<url produzione>" npx prisma migrate deploy
```

Ricorda di applicare anche la migration manuale della exclusion constraint (vedi
sezione Database sopra) se non è già stata inclusa in una migration versionata.

### Checklist variabili d'ambiente in produzione

Oltre a tutte le voci di `.env.example`:
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` — segreti forti e distinti, mai gli stessi dello sviluppo
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` — chiavi live, non test
- `EMAIL_PROVIDER_API_KEY` — obbligatoria, altrimenti le email degradano a solo-log
- `CORS_ORIGIN` — dominio esatto del frontend, mai `*` con `credentials: true`
- `NODE_ENV=production`

### Webhook Stripe

Dopo il deploy, registra l'endpoint su Stripe (Dashboard → Developers → Webhooks):
`https://<tuo-dominio>/webhooks/stripe`, selezionando almeno gli eventi
`checkout.session.completed`, `customer.subscription.updated`,
`customer.subscription.deleted`, `invoice.payment_failed`, `invoice.payment_succeeded`.

### Piattaforma

Qualsiasi host che esegua container Docker con Postgres e Redis raggiungibili
funziona (Railway, Render, Fly.io, o un VPS con `docker compose`). L'app è stateless
tra le richieste (sessioni via JWT, non sticky session), quindi scala orizzontalmente
senza modifiche — è anche il motivo per cui il rate limit è su Redis e non in-memory
(Fase 10).

## Struttura del progetto

```
src/
  modules/        # un modulo per dominio (auth, businesses, appointments, ...)
  shared/
    middleware/    # authGuard, tenantGuard, error handler
    lib/           # prisma, redis, jwt, logger, errori
  config/          # validazione env
prisma/
  schema.prisma
  migrations_manual/  # migration SQL raw non generabili da Prisma
```

## Roadmap implementazione

- [x] Fase 1 — Setup progetto + architettura + database
- [x] Fase 2 — Authentication + users + businesses
- [x] Fase 3 — Services
- [x] Fase 4 — Availability engine
- [x] Fase 5 — Customers
- [x] Fase 6 — Appointments
- [x] Fase 7 — Public booking
- [x] Fase 8 — Notifications
- [x] Fase 9 — Subscriptions + payments (Stripe)
- [x] Fase 10 — Security hardening + rate limiting
- [x] Fase 11 — Test
- [x] Fase 12 — Documentazione + Docker + deployment
