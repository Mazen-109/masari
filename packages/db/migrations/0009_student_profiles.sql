CREATE TABLE "student_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"tenant_id" uuid DEFAULT app_tenant_id() NOT NULL,
	"student_code" text NOT NULL,
	"level" smallint NOT NULL,
	"division_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_profiles_tenant_code_unique" UNIQUE("tenant_id","student_code"),
	CONSTRAINT "student_profiles_student_code_check" CHECK (student_code ~ '^[A-Za-z0-9-]{3,20}$'),
	CONSTRAINT "student_profiles_level_check" CHECK (level BETWEEN 1 AND 7)
);
--> statement-breakpoint
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_division_fk" FOREIGN KEY ("tenant_id","division_id") REFERENCES "public"."divisions"("tenant_id","id") ON DELETE restrict ON UPDATE no action;