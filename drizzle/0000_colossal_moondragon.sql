CREATE TABLE "carteras" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "carteras_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"usuario_id" integer NOT NULL,
	"nombre" varchar(60) NOT NULL,
	"moneda" char(3) NOT NULL,
	"archivada" boolean DEFAULT false NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"eliminado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sesiones" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sesiones_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"usuario_id" integer NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"token_proteccion" varchar(64) NOT NULL,
	"expira_en" timestamp with time zone NOT NULL,
	"creada_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "usuarios_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"nombre" varchar(80) NOT NULL,
	"apellido" varchar(80) NOT NULL,
	"nombre_usuario" varchar(50) NOT NULL,
	"correo" varchar(120) NOT NULL,
	"hash_contrasena" varchar(255) NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"zona_horaria" varchar(40) DEFAULT 'America/Mexico_City' NOT NULL,
	"intentos_fallidos" integer DEFAULT 0 NOT NULL,
	"bloqueado_hasta" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "carteras" ADD CONSTRAINT "carteras_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "carteras_usuario_id" ON "carteras" USING btree ("usuario_id");--> statement-breakpoint
CREATE UNIQUE INDEX "carteras_usuario_nombre" ON "carteras" USING btree ("usuario_id","nombre") WHERE "carteras"."eliminado_en" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "sesiones_token_hash" ON "sesiones" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "sesiones_token_proteccion" ON "sesiones" USING btree ("token_proteccion");--> statement-breakpoint
CREATE INDEX "sesiones_usuario_id" ON "sesiones" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "sesiones_expira_en" ON "sesiones" USING btree ("expira_en");--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_nombre_usuario_lower" ON "usuarios" USING btree (lower("nombre_usuario"));--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_correo" ON "usuarios" USING btree ("correo");--> statement-breakpoint
CREATE INDEX "usuarios_bloqueado_hasta" ON "usuarios" USING btree ("bloqueado_hasta");