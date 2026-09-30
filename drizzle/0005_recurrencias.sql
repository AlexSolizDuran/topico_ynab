CREATE TYPE "public"."tipo_regla_recurrente" AS ENUM('gasto', 'ingreso');--> statement-breakpoint
CREATE TYPE "public"."frecuencia_recurrencia" AS ENUM('diaria', 'semanal', 'mensual', 'anual');--> statement-breakpoint
CREATE TABLE "reglas_recurrentes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "reglas_recurrentes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"cartera_id" integer NOT NULL,
	"cuenta_id" integer NOT NULL,
	"sobre_id" integer,
	"descripcion" varchar(255) NOT NULL,
	"monto" numeric(16, 2) NOT NULL,
	"tipo" "tipo_regla_recurrente" NOT NULL,
	"frecuencia" "frecuencia_recurrencia" NOT NULL,
	"dia" integer NOT NULL,
	"mes" integer,
	"fecha_inicio" date NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"comercio" varchar(120),
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"eliminado_en" timestamp with time zone,
	CONSTRAINT "reglas_monto_positivo" CHECK ("monto" > 0),
	CONSTRAINT "reglas_dia_valido" CHECK ("dia" >= 1 and "dia" <= 31),
	CONSTRAINT "reglas_mes_valido" CHECK ("mes" is null or ("mes" >= 1 and "mes" <= 12))
);
--> statement-breakpoint
ALTER TABLE "reglas_recurrentes" ADD CONSTRAINT "reglas_recurrentes_cartera_id_carteras_id_fk" FOREIGN KEY ("cartera_id") REFERENCES "public"."carteras"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reglas_recurrentes" ADD CONSTRAINT "reglas_recurrentes_cuenta_id_cuentas_id_fk" FOREIGN KEY ("cuenta_id") REFERENCES "public"."cuentas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reglas_recurrentes" ADD CONSTRAINT "reglas_recurrentes_sobre_id_sobres_id_fk" FOREIGN KEY ("sobre_id") REFERENCES "public"."sobres"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reglas_recurrentes_cartera_id" ON "reglas_recurrentes" USING btree ("cartera_id");--> statement-breakpoint
CREATE INDEX "reglas_recurrentes_cuenta_id" ON "reglas_recurrentes" USING btree ("cuenta_id");--> statement-breakpoint
CREATE INDEX "reglas_recurrentes_sobre_id" ON "reglas_recurrentes" USING btree ("sobre_id");--> statement-breakpoint
CREATE INDEX "reglas_recurrentes_activas" ON "reglas_recurrentes" USING btree ("cartera_id","activa") WHERE "eliminado_en" is null;--> statement-breakpoint
ALTER TABLE "movimientos" ADD COLUMN "regla_id" integer;--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_regla_id_reglas_recurrentes_id_fk" FOREIGN KEY ("regla_id") REFERENCES "public"."reglas_recurrentes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "movimientos_regla_id" ON "movimientos" USING btree ("regla_id") WHERE "movimientos"."eliminado_en" is null;
