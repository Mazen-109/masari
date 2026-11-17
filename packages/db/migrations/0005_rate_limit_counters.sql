CREATE TABLE "rate_limit_counters" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "rate_limit_counters_key_check" CHECK (char_length(key) <= 200),
	CONSTRAINT "rate_limit_counters_count_check" CHECK (count >= 0)
);
