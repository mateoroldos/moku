CREATE TABLE "auth_mail_admission" (
	"address_key" text PRIMARY KEY,
	"next_allowed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "auth_mail_admission_expiry_idx" ON "auth_mail_admission" ("next_allowed_at");