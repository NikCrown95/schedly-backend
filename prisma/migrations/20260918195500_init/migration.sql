CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE "UserRole" AS ENUM ('OWNER','STAFF','ADMIN');
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE','SUSPENDED','PENDING_VERIFICATION');
CREATE TYPE "BusinessStatus" AS ENUM ('ACTIVE','SUSPENDED','ONBOARDING');
CREATE TYPE "AppointmentStatus" AS ENUM ('PENDING','CONFIRMED','CANCELLED','COMPLETED','NO_SHOW');
CREATE TYPE "AppointmentSource" AS ENUM ('WEBSITE','WHATSAPP','ADMIN');
CREATE TYPE "SubscriptionPlan" AS ENUM ('TRIAL','PRO','BUSINESS');
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING','ACTIVE','PAST_DUE','CANCELLED','EXPIRED');
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL','SMS','WHATSAPP','PUSH');
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING','SENT','FAILED');

CREATE TABLE "users" ("id" TEXT PRIMARY KEY,"email" TEXT NOT NULL UNIQUE,"password_hash" TEXT NOT NULL,"first_name" TEXT NOT NULL,"last_name" TEXT NOT NULL,"phone" TEXT,"role" "UserRole" NOT NULL DEFAULT 'OWNER',"status" "UserStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',"email_verified_at" TIMESTAMP(3),"created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updated_at" TIMESTAMP(3) NOT NULL);
CREATE TABLE "refresh_tokens" ("id" TEXT PRIMARY KEY,"user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,"token_hash" TEXT NOT NULL,"revoked_at" TIMESTAMP(3),"expires_at" TIMESTAMP(3) NOT NULL,"created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");
CREATE TABLE "password_reset_tokens" ("id" TEXT PRIMARY KEY,"user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,"token_hash" TEXT NOT NULL,"used_at" TIMESTAMP(3),"expires_at" TIMESTAMP(3) NOT NULL,"created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

CREATE TABLE "businesses" ("id" TEXT PRIMARY KEY,"owner_id" TEXT NOT NULL REFERENCES "users"("id"),"name" TEXT NOT NULL,"slug" TEXT NOT NULL UNIQUE,"description" TEXT,"category" TEXT,"email" TEXT,"phone" TEXT,"address" TEXT,"city" TEXT,"postal_code" TEXT,"country" TEXT,"timezone" TEXT NOT NULL DEFAULT 'Europe/Rome',"logo_url" TEXT,"status" "BusinessStatus" NOT NULL DEFAULT 'ONBOARDING',"created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updated_at" TIMESTAMP(3) NOT NULL);
CREATE INDEX "businesses_owner_id_idx" ON "businesses"("owner_id");

CREATE TABLE "staff_members" ("id" TEXT PRIMARY KEY,"business_id" TEXT NOT NULL REFERENCES "businesses"("id") ON DELETE CASCADE,"user_id" TEXT REFERENCES "users"("id"),"display_name" TEXT NOT NULL,"active" BOOLEAN NOT NULL DEFAULT true,"created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updated_at" TIMESTAMP(3) NOT NULL);
CREATE INDEX "staff_members_business_id_idx" ON "staff_members"("business_id");

CREATE TABLE "services" ("id" TEXT PRIMARY KEY,"business_id" TEXT NOT NULL REFERENCES "businesses"("id") ON DELETE CASCADE,"name" TEXT NOT NULL,"description" TEXT,"duration_minutes" INTEGER NOT NULL,"price_cents" INTEGER NOT NULL,"currency" TEXT NOT NULL DEFAULT 'EUR',"color" TEXT,"active" BOOLEAN NOT NULL DEFAULT true,"created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updated_at" TIMESTAMP(3) NOT NULL);
CREATE INDEX "services_business_id_idx" ON "services"("business_id");

CREATE TABLE "availability_rules" ("id" TEXT PRIMARY KEY,"business_id" TEXT NOT NULL REFERENCES "businesses"("id") ON DELETE CASCADE,"staff_member_id" TEXT REFERENCES "staff_members"("id") ON DELETE CASCADE,"day_of_week" INTEGER NOT NULL,"start_time" TEXT NOT NULL,"end_time" TEXT NOT NULL,"created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updated_at" TIMESTAMP(3) NOT NULL);
CREATE INDEX "availability_rules_business_id_day_of_week_idx" ON "availability_rules"("business_id","day_of_week");
CREATE TABLE "availability_exceptions" ("id" TEXT PRIMARY KEY,"business_id" TEXT NOT NULL REFERENCES "businesses"("id") ON DELETE CASCADE,"staff_member_id" TEXT REFERENCES "staff_members"("id") ON DELETE CASCADE,"date" DATE NOT NULL,"is_closed" BOOLEAN NOT NULL DEFAULT true,"start_time" TEXT,"end_time" TEXT,"reason" TEXT,"created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "availability_exceptions_business_id_date_idx" ON "availability_exceptions"("business_id","date");

CREATE TABLE "customers" ("id" TEXT PRIMARY KEY,"business_id" TEXT NOT NULL REFERENCES "businesses"("id") ON DELETE CASCADE,"first_name" TEXT NOT NULL,"last_name" TEXT,"email" TEXT,"phone" TEXT,"normalized_phone" TEXT,"notes" TEXT,"created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updated_at" TIMESTAMP(3) NOT NULL);
CREATE INDEX "customers_business_id_idx" ON "customers"("business_id");
CREATE INDEX "customers_business_id_email_idx" ON "customers"("business_id","email");
CREATE UNIQUE INDEX "customers_business_id_normalized_phone_key" ON "customers"("business_id","normalized_phone");

CREATE TABLE "appointments" ("id" TEXT PRIMARY KEY,"business_id" TEXT NOT NULL REFERENCES "businesses"("id") ON DELETE CASCADE,"service_id" TEXT NOT NULL REFERENCES "services"("id"),"customer_id" TEXT NOT NULL REFERENCES "customers"("id"),"staff_member_id" TEXT REFERENCES "staff_members"("id"),"start_at" TIMESTAMP(3) NOT NULL,"end_at" TIMESTAMP(3) NOT NULL,"status" "AppointmentStatus" NOT NULL DEFAULT 'PENDING',"source" "AppointmentSource" NOT NULL DEFAULT 'WEBSITE',"price_cents" INTEGER NOT NULL,"duration_minutes" INTEGER NOT NULL,"notes" TEXT,"cancelled_at" TIMESTAMP(3),"cancelled_by" TEXT,"created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updated_at" TIMESTAMP(3) NOT NULL);
CREATE INDEX "appointments_business_id_start_at_idx" ON "appointments"("business_id","start_at");
CREATE INDEX "appointments_business_id_status_idx" ON "appointments"("business_id","status");
CREATE INDEX "appointments_customer_id_idx" ON "appointments"("customer_id");
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_no_overlap" EXCLUDE USING gist ("business_id" WITH =, tsrange("start_at","end_at",'[)') WITH &&) WHERE ("status" IN ('PENDING','CONFIRMED'));

CREATE TABLE "subscriptions" ("id" TEXT PRIMARY KEY,"business_id" TEXT NOT NULL UNIQUE REFERENCES "businesses"("id") ON DELETE CASCADE,"plan" "SubscriptionPlan" NOT NULL DEFAULT 'TRIAL',"status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',"trial_ends_at" TIMESTAMP(3),"current_period_end" TIMESTAMP(3),"cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,"stripe_customer_id" TEXT UNIQUE,"stripe_subscription_id" TEXT UNIQUE,"created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updated_at" TIMESTAMP(3) NOT NULL);
CREATE TABLE "webhook_events" ("id" TEXT PRIMARY KEY,"business_id" TEXT REFERENCES "businesses"("id"),"provider" TEXT NOT NULL,"event_id" TEXT NOT NULL UNIQUE,"event_type" TEXT NOT NULL,"payload" JSONB NOT NULL,"processed_at" TIMESTAMP(3),"created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "notification_logs" ("id" TEXT PRIMARY KEY,"business_id" TEXT NOT NULL REFERENCES "businesses"("id") ON DELETE CASCADE,"channel" "NotificationChannel" NOT NULL DEFAULT 'EMAIL',"event_type" TEXT NOT NULL,"recipient" TEXT NOT NULL,"status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',"error" TEXT,"created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "notification_logs_business_id_idx" ON "notification_logs"("business_id");
