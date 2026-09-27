CREATE TYPE "tipo_cuenta" AS ENUM('corriente', 'ahorro', 'efectivo', 'credito');--> statement-breakpoint
CREATE TYPE "tipo_movimiento" AS ENUM('gasto', 'ingreso', 'traspaso');--> statement-breakpoint
CREATE TYPE "origen_movimiento" AS ENUM('manual', 'recurrente');--> statement-breakpoint
CREATE TABLE "cuentas" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cuentas_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"cartera_id" integer NOT NULL,
	"nombre" varchar(60) NOT NULL,
	"tipo" "tipo_cuenta" DEFAULT 'corriente' NOT NULL,
	"saldo_inicial" numeric(16, 2) DEFAULT '0.00' NOT NULL,
	"archivada" boolean DEFAULT false NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"eliminado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "movimientos" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "movimientos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"cuenta_id" integer NOT NULL,
	"sobre_id" integer,
	"tipo" "tipo_movimiento" NOT NULL,
	"monto" numeric(16, 2) NOT NULL,
	"fecha" date NOT NULL,
	"descripcion" varchar(255) NOT NULL,
	"comercio" varchar(120),
	"origen" "origen_movimiento" DEFAULT 'manual' NOT NULL,
	"eliminado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cuentas" ADD CONSTRAINT "cuentas_cartera_id_carteras_id_fk" FOREIGN KEY ("cartera_id") REFERENCES "public"."carteras"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_cuenta_id_cuentas_id_fk" FOREIGN KEY ("cuenta_id") REFERENCES "public"."cuentas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cuentas_cartera_id" ON "cuentas" USING btree ("cartera_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cuentas_cartera_nombre" ON "cuentas" USING btree ("cartera_id","nombre") WHERE "cuentas"."eliminado_en" is null;--> statement-breakpoint
CREATE INDEX "movimientos_cuenta_id" ON "movimientos" USING btree ("cuenta_id");--> statement-breakpoint
CREATE INDEX "movimientos_cuenta_vivo" ON "movimientos" USING btree ("cuenta_id") WHERE "movimientos"."eliminado_en" is null;--> statement-breakpoint
CREATE INDEX "movimientos_sobre_id" ON "movimientos" USING btree ("sobre_id");