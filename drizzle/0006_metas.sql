CREATE TYPE "public"."estado_meta" AS ENUM('activa', 'completada', 'abandonada');--> statement-breakpoint
CREATE TABLE "metas" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "metas_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"sobre_id" integer NOT NULL,
	"monto_objetivo" numeric(16, 2) NOT NULL,
	"fecha_limite" date,
	"estado" "estado_meta" DEFAULT 'activa' NOT NULL,
	"completada_en" timestamp with time zone,
	"abandonada_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "metas_monto_positivo" CHECK ("monto_objetivo" > 0)
);
--> statement-breakpoint
ALTER TABLE "metas" ADD CONSTRAINT "metas_sobre_id_sobres_id_fk" FOREIGN KEY ("sobre_id") REFERENCES "public"."sobres"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "metas_sobre_id" ON "metas" USING btree ("sobre_id");--> statement-breakpoint
CREATE UNIQUE INDEX "metas_sobre_activa_unica" ON "metas" USING btree ("sobre_id") WHERE "metas"."estado" = 'activa';
