CREATE TABLE "human_tasks" (
	"id" uuid PRIMARY KEY,
	"intent" text NOT NULL,
	"subject" jsonb NOT NULL,
	"context" text,
	"response" jsonb NOT NULL,
	"created_at" timestamp(3) with time zone NOT NULL,
	"status" text NOT NULL,
	"result" jsonb,
	"completed_at" timestamp(3) with time zone,
	CONSTRAINT "human_tasks_lifecycle" CHECK ((
    "status" = 'pending' AND "result" IS NULL AND "completed_at" IS NULL
  ) OR (
    "status" = 'completed' AND "result" IS NOT NULL AND "completed_at" IS NOT NULL
  ))
);
