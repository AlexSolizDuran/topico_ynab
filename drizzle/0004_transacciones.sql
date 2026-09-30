CREATE TABLE "grupos_transferencia" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "grupos_transferencia_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"descripcion" varchar(255) NOT NULL,
	"fecha" date NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "movimientos" ADD COLUMN "transferencia_id" integer;--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_transferencia_id_grupos_transferencia_id_fk" FOREIGN KEY ("transferencia_id") REFERENCES "public"."grupos_transferencia"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "movimientos_transferencia_id" ON "movimientos" USING btree ("transferencia_id") WHERE "movimientos"."eliminado_en" is null;
