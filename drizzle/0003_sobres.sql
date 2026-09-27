CREATE TYPE "motivo_asignacion" AS ENUM('usuario', 'reasignacion');--> statement-breakpoint
CREATE TABLE "asignaciones" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "asignaciones_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"sobre_id" integer NOT NULL,
	"periodo" text NOT NULL,
	"motivo" "motivo_asignacion" DEFAULT 'usuario' NOT NULL,
	"monto" numeric(16, 2) NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asignaciones_monto_segun_motivo" CHECK ((
        ("asignaciones"."motivo" = 'usuario' and "asignaciones"."monto" > 0)
        or ("asignaciones"."motivo" = 'reasignacion' and "asignaciones"."monto" <> 0)
      )),
	CONSTRAINT "asignaciones_periodo_formato" CHECK ("asignaciones"."periodo" ~ '^\d{4}-(0[1-9]|1[0-2])$')
);
--> statement-breakpoint
CREATE TABLE "sobres" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sobres_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"cartera_id" integer NOT NULL,
	"grupo_id" integer NOT NULL,
	"nombre" text NOT NULL,
	"archivado" boolean DEFAULT false NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"eliminado_en" timestamp with time zone
);
--> statement-breakpoint
DROP INDEX "movimientos_sobre_id";--> statement-breakpoint
ALTER TABLE "asignaciones" ADD CONSTRAINT "asignaciones_sobre_id_sobres_id_fk" FOREIGN KEY ("sobre_id") REFERENCES "public"."sobres"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sobres" ADD CONSTRAINT "sobres_cartera_id_carteras_id_fk" FOREIGN KEY ("cartera_id") REFERENCES "public"."carteras"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sobres" ADD CONSTRAINT "sobres_grupo_id_grupos_id_fk" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asignaciones_sobre_periodo" ON "asignaciones" USING btree ("sobre_id","periodo");--> statement-breakpoint
CREATE INDEX "sobres_cartera_id" ON "sobres" USING btree ("cartera_id");--> statement-breakpoint
CREATE INDEX "sobres_grupo_id" ON "sobres" USING btree ("grupo_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sobres_cartera_nombre" ON "sobres" USING btree ("cartera_id","nombre") WHERE "sobres"."eliminado_en" is null;--> statement-breakpoint
CREATE INDEX "sobres_cartera_grupo_orden" ON "sobres" USING btree ("cartera_id","grupo_id","orden");--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_sobre_id_sobres_id_fk" FOREIGN KEY ("sobre_id") REFERENCES "public"."sobres"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "movimientos_sobre_id" ON "movimientos" USING btree ("sobre_id") WHERE "movimientos"."eliminado_en" is null;