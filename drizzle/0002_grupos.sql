CREATE TABLE "grupos" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "grupos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"cartera_id" integer NOT NULL,
	"nombre" text NOT NULL,
	"archivado" boolean DEFAULT false NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "grupos" ADD CONSTRAINT "grupos_cartera_id_carteras_id_fk" FOREIGN KEY ("cartera_id") REFERENCES "public"."carteras"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "grupos_cartera_id" ON "grupos" USING btree ("cartera_id");--> statement-breakpoint
CREATE UNIQUE INDEX "grupos_cartera_nombre" ON "grupos" USING btree ("cartera_id","nombre");--> statement-breakpoint
CREATE INDEX "grupos_cartera_orden" ON "grupos" USING btree ("cartera_id","orden");