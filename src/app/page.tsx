import Link from 'next/link'
import { formatear } from '@/dinero'
import estilos from './portada.module.css'
import tema from '../components/tema-oscuro.module.css'
import { BotonTema } from '../components/boton-tema'

export const metadata = {
  title: 'Sobres — Dale destino a tu dinero antes de gastarlo',
  description:
    'App de finanzas personales con sobres de presupuesto. Registra tus ingresos y gastos, mira tu patrimonio y controla mes a mes cuánto te queda.',
}

const MONEDA = 'MXN'

/**
 * Iconos de línea, grosor uniforme y estilo outline, como pide el sistema visual.
 *
 * Van acá y no en un paquete porque son doce, todos del mismo trazo y usados en una sola
 * vista: un archivo de iconos compartido sería más difícil de mantener que el costo de
 * la dependencia. Cada entrada es el CONTENIDO del `<svg>`, para que el marco, el `stroke`
 * y el tamaño se escriban una sola vez.
 */
const ICONOS = {
  sobre: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
    </>
  ),
  reloj: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  barras: (
    <>
      <path d="M4 20V11" />
      <path d="M10 20V4" />
      <path d="M16 20v-6" />
      <path d="M22 20H2" />
    </>
  ),
  comparar: (
    <>
      <path d="M8 3 4 7l4 4" />
      <path d="M4 7h16" />
      <path d="m16 21 4-4-4-4" />
      <path d="M20 17H4" />
    </>
  ),
  repetir: (
    <>
      <path d="m17 2 4 4-4 4" />
      <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
      <path d="m7 22-4-4 4-4" />
      <path d="M21 13v1a4 4 0 0 1-4 4H3" />
    </>
  ),
  capas: (
    <>
      <path d="M12 3 3 7.5 12 12l9-4.5L12 3Z" />
      <path d="m3 12.5 9 4.5 9-4.5" />
    </>
  ),
  candado: (
    <>
      <path d="M12 3 4 6v6c0 4.5 3.2 7.7 8 9 4.8-1.3 8-4.5 8-9V6l-8-3Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  flecha: (
    <>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </>
  ),
  palomita: <path d="m5 13 4 4L19 7" />,
  chispa: (
    <>
      <path d="M12 3v4" />
      <path d="M12 17v4" />
      <path d="M3 12h4" />
      <path d="M17 12h4" />
      <path d="m5.6 5.6 2.9 2.9" />
      <path d="m15.5 15.5 2.9 2.9" />
      <path d="M18.4 5.6 15.5 8.5" />
      <path d="m8.5 15.5-2.9 2.9" />
    </>
  ),
} as const

type NombreIcono = keyof typeof ICONOS

function Icono({
  nombre,
  className,
  relleno = false,
}: {
  nombre: NombreIcono
  className?: string
  /** Rellena el trazo en vez de dibujarlo, para los iconos que son marca. */
  relleno?: boolean
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill={relleno ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={relleno ? 0 : 1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {ICONOS[nombre]}
    </svg>
  )
}

/**
 * Los bloques de "qué puedes hacer".
 *
 * Cada uno describe algo que el sistema YA hace, no algo que promete. El texto sale de
 * los specs: sobres derivados, cuentas de cuatro tipos, patrimonio como suma, ingresos en
 * cuentas distintas, comparación entre periodos, recurrencias y metas.
 *
 * El `tono` elige el color del icono. No es decoración: sigue la misma regla de
 * significado del producto, donde verde es disponible, ámbar es atención y magenta marca
 * lo que crece.
 */
const VENTAJAS: ReadonlyArray<{
  icono: NombreIcono
  tono: 'lima' | 'menta' | 'ambar' | 'magenta'
  titulo: string
  texto: string
}> = [
  {
    icono: 'sobre',
    tono: 'lima',
    titulo: 'Sobres de presupuesto',
    texto:
      'Cada peso recibe un destino antes de gastarse. Le pones nombre a tus sobres —renta, despensa, salidas— y el disponible de cada uno se calcula solo: nunca se guarda, sale de lo que asignaste menos lo que gastaste.',
  },
  {
    icono: 'reloj',
    tono: 'menta',
    titulo: 'Gastos del día a día y mes a mes',
    texto:
      'Registras cada movimiento con su fecha y ya está. Puedes capturar un gasto de hoy o uno de hace tres meses, y corregir cualquiera de los dos recalcula los derivados.',
  },
  {
    icono: 'capas',
    tono: 'magenta',
    titulo: 'Cuentas de donde viene tu dinero',
    texto:
      'Corriente, ahorro, efectivo y crédito. Registras un ingreso en la cuenta que corresponde, y los saldos se presentan en su propia moneda.',
  },
  {
    icono: 'barras',
    tono: 'ambar',
    titulo: 'El balance, en un solo lugar',
    texto:
      'Patrimonio, dinero suelto y el disponible de cada sobre, sin sumas que no existan. El dinero sin asignar aparece separado, porque es dinero que todavía no tiene destino.',
  },
  {
    icono: 'comparar',
    tono: 'lima',
    titulo: 'Comparas periodos',
    texto:
      'Dos o tres meses lado a lado, desglosados por sobre o por grupo, con las diferencias de gasto e ingreso y las variaciones que destacan.',
  },
  {
    icono: 'repetir',
    tono: 'menta',
    titulo: 'Gastos que se repiten y metas de ahorro',
    texto:
      'Las reglas recurrentes materializan tus ingresos y gastos fijos al reabrir la app. Y un sobre puede tener meta: ves cuánto falta para llegar.',
  },
]

/** La clase de color de cada tono, para el icono de la tarjeta. */
const TONOS = {
  lima: estilos.textoLima,
  menta: estilos.textoMenta,
  ambar: estilos.textoAmbar,
  magenta: estilos.textoMagenta,
} as const

const PASOS = [
  {
    titulo: 'Crea tu cuenta y tu cartera',
    texto:
      'Empiezas con una cartera en pesos mexicanos. La cartera es el contenedor de todo lo tuyo, con su propia moneda.',
  },
  {
    titulo: 'Abre tus cuentas y reparte el dinero',
    texto:
      'Registras de dónde entra tu dinero y lo asignas a sobres. El dinero suelto te dice qué falta por decidir.',
  },
  {
    titulo: 'Registra cada gasto y mira el resultado',
    texto:
      'El panel se actualiza solo. Puedes corregir el pasado sin miedo: los disponibles y el patrimonio se recalculan.',
  },
] as const

/** La cinta de palabras. Va duplicada en el render para que el bucle no se note. */
const CINTA = [
  'Sobres',
  'Patrimonio',
  'Disponible',
  'Dinero suelto',
  'Asignaciones',
  'Cuentas',
  'Comparativos',
  'Metas',
  'Recurrencias',
  'Traspasos',
] as const

/**
 * Los sobres del panel de muestra. Solo texto de ejemplo para la portada.
 *
 * `ancho` es un porcentaje, no un importe: no pasa por `Dinero` porque no es dinero, es
 * la proporción que se dibuja en la barra. `alerta` marca el sobre que se pasó, para que
 * se vea en el color de riesgo y no solo como un número más.
 */
const SOBRES_MUESTRA: ReadonlyArray<{
  nombre: string
  disponible: string
  ancho: string
  alerta?: boolean
}> = [
  { nombre: 'Renta y servicios', disponible: '4,120.00', ancho: '78%' },
  { nombre: 'Alimentación', disponible: '2,650.50', ancho: '54%' },
  { nombre: 'Transporte', disponible: '910.00', ancho: '31%' },
  { nombre: 'Salidas', disponible: '—', ancho: '96%', alerta: true },
]

export default function Portada() {
  return (
    <div className={`${estilos.portada} ${tema.oscuro} font-texto text-[var(--tinta-media)]`}>
      <div aria-hidden="true" className={estilos.aurora}>
        <span />
      </div>
<div aria-hidden="true" className={tema.rejilla} />
              <div aria-hidden="true" className={tema.grano} />

      <header
        className={`${estilos.fondoCinta} sticky top-0 z-50 border-b backdrop-blur-xl ${estilos.bordeTenue}`}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3.5">
          <Link href="/" className="flex items-center gap-2.5">
            <span className={`${estilos.fondoLima} grid h-9 w-9 place-items-center rounded-xl`}>
              <Icono nombre="sobre" className={`h-5 w-5 ${estilos.textoFondo}`} relleno />
            </span>
            <span className={`${estilos.textoTinta} font-cifra text-lg font-bold`}>
              Sobres
            </span>
          </Link>

          <nav aria-label="Principal" className="hidden items-center gap-8 md:flex">
            <a
              href="#que-haces"
              className={`${estilos.textoMedia} text-sm transition-colors hover:text-[var(--lima)]`}
            >
              Qué puedes hacer
            </a>
            <a
              href="#balance"
              className={`${estilos.textoMedia} text-sm transition-colors hover:text-[var(--lima)]`}
            >
              El balance
            </a>
            <a
              href="#como-funciona"
              className={`${estilos.textoMedia} text-sm transition-colors hover:text-[var(--lima)]`}
            >
              Cómo funciona
            </a>
          </nav>

          <div className="flex items-center gap-2">
            <BotonTema />

            <Link
              href="/entrar"
              className={`${estilos.vidrio} ${estilos.textoTinta} rounded-xl px-4 py-2 text-sm font-semibold transition-colors hover:bg-white/12`}
            >
              Entrar
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* HERO */}
        <section className="relative overflow-hidden">
          <div className="mx-auto grid max-w-6xl items-center gap-16 px-4 pt-20 pb-24 lg:grid-cols-2 lg:pt-28 lg:pb-32">
            <div>
              <p
                className={`${estilos.vidrio} ${estilos.textoMedia} inline-flex items-center gap-2.5 rounded-full py-1.5 pr-4 pl-2 text-xs font-semibold tracking-wide uppercase`}
              >
                <span
                  className={`${estilos.pulso} h-2 w-2 rounded-full ${estilos.textoLima}`}
                />
                Finanzas personales
              </p>

              <h1
                className={`${estilos.titular} ${estilos.textoTinta} mt-7 text-5xl font-bold text-balance sm:text-6xl`}
              >
                Dale destino a tu dinero{' '}
                <span className={estilos.degradado}>antes de gastarlo</span>
              </h1>

              <p className={`${estilos.textoMedia} mt-6 max-w-xl text-lg leading-relaxed`}>
                Sobres es una web para llevar tus finanzas personales: repartes tu dinero
                en sobres, registras cada gasto e ingreso, y ves en un solo lugar cuánto
                te queda y cuánto has construido.
              </p>

              <div className="mt-10 flex flex-col gap-3.5 sm:flex-row sm:items-center">
                <Link
                  href="/registro"
                  className={`${estilos.brilloBarrido} ${estilos.brilloLima} ${estilos.fondoLima} ${estilos.textoFondo} inline-flex items-center justify-center gap-2 rounded-2xl px-7 py-4 text-base font-bold transition-transform hover:scale-[1.02]`}
                >
                  <span className="relative z-10">Crear mi cuenta</span>
                  <Icono nombre="flecha" className="relative z-10 h-4 w-4" />
                </Link>

                <Link
                  href="/entrar"
                  className={`${estilos.vidrio} ${estilos.textoTinta} inline-flex items-center justify-center rounded-2xl px-7 py-4 text-base font-semibold transition-colors hover:bg-white/12`}
                >
                  Ya tengo cuenta, entrar
                </Link>
              </div>

              <div
                className={`${estilos.textoTenue} mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm`}
              >
                <span className="inline-flex items-center gap-2">
                  <Icono nombre="candado" className={`h-4 w-4 ${estilos.textoMenta}`} />
                  Cada usuario ve únicamente sus propios datos
                </span>
              </div>
            </div>

            {/* Panel de muestra: los bloques 1 y 4 del panel real, con datos de ejemplo. */}
            <div className="relative">
              <div
                aria-hidden="true"
                className={`${estilos.brilloMenta} absolute -inset-6 -z-10 rounded-[2.5rem] opacity-40 blur-2xl`}
              />

              <div
                className={`${estilos.vidrio} ${estilos.flotar} rounded-tarjeta p-7 sm:p-8`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p
                      className={`${estilos.textoTenue} text-xs font-semibold tracking-[0.18em] uppercase`}
                    >
                      Patrimonio
                    </p>
                    <p
                      className={`${estilos.textoLima} cifra mt-2.5 text-4xl font-bold tracking-tight sm:text-5xl`}
                    >
                      {formatear('48250.00', MONEDA)}
                    </p>
                  </div>

                  <span
                    className={`${estilos.textoMedia} shrink-0 rounded-full border border-white/12 bg-white/6 px-2.5 py-1 text-[0.7rem] font-semibold tracking-wide uppercase`}
                  >
                    Ejemplo
                  </span>
                </div>

                <p className={`${estilos.textoMedia} mt-4 text-sm`}>
                  <span className={`${estilos.textoMenta} cifra font-semibold`}>
                    {formatear('38900.00', MONEDA)}
                  </span>{' '}
                  en sobres
                  <span aria-hidden="true" className={`${estilos.textoTenue} mx-2`}>
                    +
                  </span>
                  <span className={`${estilos.textoTinta} cifra font-semibold`}>
                    {formatear('9350.00', MONEDA)}
                  </span>{' '}
                  sin asignar
                </p>

                <div className={`mt-7 border-t ${estilos.bordeTenue} pt-6`}>
                  <h2
                    className={`${estilos.textoTinta} flex items-center gap-2 text-sm font-semibold`}
                  >
                    <Icono
                      nombre="chispa"
                      className={`h-4 w-4 ${estilos.textoLima}`}
                      relleno
                    />
                    Tus sobres
                  </h2>

                  <ul className="mt-5 flex flex-col gap-5">
                    {SOBRES_MUESTRA.map((sobre) => (
                      <li key={sobre.nombre}>
                        <div className="flex items-baseline justify-between gap-4">
                          <span className={`${estilos.textoMedia} text-sm font-medium`}>
                            {sobre.nombre}
                          </span>
                          <span
                            className={`cifra text-sm font-semibold ${sobre.alerta ? estilos.textoRiesgo : estilos.textoMenta}`}
                          >
                            {sobre.disponible}
                          </span>
                        </div>

                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/8">
                          <div
                            className={`${sobre.alerta ? estilos.barraAlerta : estilos.barra} h-full rounded-full`}
                            style={{ width: sobre.ancho }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>

                  <p
                    className={`${estilos.textoTenue} mt-5 flex items-start gap-2 text-xs leading-relaxed`}
                  >
                    <span className={`mt-0.5 ${estilos.textoRiesgo}`}>
                      <Icono nombre="candado" className="h-3.5 w-3.5" />
                    </span>
                    <span>
                      Un sobre puede quedar negativo y el sistema{' '}
                      <span className={estilos.textoRiesgo}>no lo corrige</span>: lo avisa y
                      tú decides.
                    </span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CINTA */}
        <section
          aria-hidden="true"
          className={`${estilos.cinta} border-y ${estilos.bordeTenue} py-5`}
        >
          <div className={estilos.cintaPista}>
            {[...CINTA, ...CINTA].map((palabra, indice) => (
              <span
                key={`${palabra}-${indice}`}
                className={`${estilos.textoTenue} font-cifra flex shrink-0 items-center gap-8 pr-8 text-sm font-semibold tracking-wide uppercase`}
              >
                {palabra}
                <span className={`h-1 w-1 rounded-full ${estilos.limaPunto}`} />
              </span>
            ))}
          </div>
        </section>

        {/* QUÉ PUEDES HACER */}
        <section id="que-haces" className="px-4 py-24 sm:py-28">
          <div className="mx-auto max-w-6xl">
            <p className={`${estilos.textoLima} text-xs font-semibold tracking-[0.18em] uppercase`}>
              Qué puedes hacer
            </p>
            <h2
              className={`${estilos.titular} ${estilos.textoTinta} mt-4 max-w-3xl text-4xl font-bold text-balance sm:text-5xl`}
            >
              Todo lo que llevas hoy en una hoja de cálculo,{' '}
              <span className={estilos.degradado}>en un solo lugar</span>
            </h2>
            <p className={`${estilos.textoMedia} mt-5 max-w-2xl text-lg leading-relaxed`}>
              No te muestra un total bonito y nada más. Te deja poner nombre a tus
              gastos, ver de dónde viene tu dinero y comparar un mes contra otro.
            </p>

            <ul className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {VENTAJAS.map((ventaja) => (
                <li
                  key={ventaja.titulo}
                  className={`${estilos.vidrio} ${estilos.elevar} rounded-tarjeta p-7`}
                >
                  <span
                    className={`grid h-12 w-12 place-items-center rounded-2xl bg-white/6 ${TONOS[ventaja.tono]}`}
                  >
                    <Icono nombre={ventaja.icono} className="h-6 w-6" />
                  </span>

                  <h3 className={`${estilos.textoTinta} mt-6 text-lg font-bold`}>
                    {ventaja.titulo}
                  </h3>
                  <p className={`${estilos.textoMedia} mt-3 leading-relaxed`}>
                    {ventaja.texto}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* EL BALANCE */}
        <section id="balance" className="relative px-4 py-24 sm:py-28">
          <div className="mx-auto grid max-w-6xl items-center gap-16 lg:grid-cols-2">
            <div>
              <span
                className={`${estilos.limaTenue} ${estilos.textoLima} grid h-12 w-12 place-items-center rounded-2xl`}
              >
                <Icono nombre="barras" className="h-6 w-6" />
              </span>

              <h2
                className={`${estilos.titular} ${estilos.textoTinta} mt-6 text-4xl font-bold text-balance sm:text-5xl`}
              >
                Tu balance siempre responde{' '}
                <span className={estilos.degradadoCalido}>la misma cuenta</span>
              </h2>

              <p className={`${estilos.textoMedia} mt-5 text-lg leading-relaxed`}>
                El patrimonio no es un número que se guarda: se calcula. Y siempre sale
                igual, porque el sistema no tiene atajos para que cuadre.
              </p>

              <p
                className={`${estilos.bordeGradiente} ${estilos.textoTinta} cifra mt-9 rounded-tarjeta px-7 py-6 text-center text-lg font-bold`}
              >
                patrimonio = disponible de los sobres + dinero suelto
              </p>
            </div>

            <ul className="flex flex-col gap-4">
              <li className={`${estilos.vidrio} rounded-tarjeta p-7`}>
                <h3 className={`${estilos.textoTinta} flex items-center gap-2.5 font-bold`}>
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${estilos.fondoLima}`} />
                  El disponible de un sobre nunca se guarda
                </h3>
                <p className={`${estilos.textoMedia} mt-3 leading-relaxed`}>
                  Es lo que le asignaste menos lo que gastaste y reservaste. Si corriges un
                  movimiento de marzo, el disponible de marzo se recalcula solo: corregir
                  el pasado repara el presente.
                </p>
              </li>

              <li className={`${estilos.vidrio} rounded-tarjeta p-7`}>
                <h3 className={`${estilos.textoTinta} flex items-center gap-2.5 font-bold`}>
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--menta)]"
                  />
                  El dinero suelto es dinero sin destino
                </h3>
                <p className={`${estilos.textoMedia} mt-3 leading-relaxed`}>
                  Lo que hay en tus cuentas y todavía no asignaste. Aparece separado del
                  patrimonio, porque es una decisión que sigue pendiente, no un ahorro.
                </p>
              </li>

              <li className={`${estilos.vidrio} rounded-tarjeta p-7`}>
                <h3 className={`${estilos.textoTinta} flex items-center gap-2.5 font-bold`}>
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--riesgo)]" />
                  Si un sobre queda negativo, lo ves
                </h3>
                <p className={`${estilos.textoMedia} mt-3 leading-relaxed`}>
                  Te pasaste y el sistema no lo corrige por ti: lo muestra en rojo y te
                  avisa que hay dinero suelto. Tapar un desborde es decisión tuya.
                </p>
              </li>
            </ul>
          </div>
        </section>

        {/* CÓMO FUNCIONA */}
        <section id="como-funciona" className="px-4 py-24 sm:py-28">
          <div className="mx-auto max-w-6xl">
            <p className={`${estilos.textoMenta} text-xs font-semibold tracking-[0.18em] uppercase`}>
              Cómo funciona
            </p>
            <h2
              className={`${estilos.titular} ${estilos.textoTinta} mt-4 max-w-3xl text-4xl font-bold text-balance sm:text-5xl`}
            >
              Empiezas en tres pasos y{' '}
              <span className={estilos.degradado}>nunca más empiezas de cero</span>
            </h2>
            <p className={`${estilos.textoMedia} mt-5 max-w-2xl text-lg leading-relaxed`}>
              Los meses no se reinician: lo que sobra en marzo sigue ahí en abril. Por eso
              el balance solo mejora, en lugar de volver a cero cada mes.
            </p>

            <ol className="mt-16 grid gap-5 md:grid-cols-3">
              {PASOS.map((paso, indice) => (
                <li
                  key={paso.titulo}
                  className={`${estilos.vidrio} ${estilos.elevar} rounded-tarjeta p-7`}
                >
                  <span
                    className={`${estilos.paso} ${estilos.textoLima} cifra grid h-11 w-11 place-items-center rounded-2xl text-base font-bold`}
                  >
                    {indice + 1}
                  </span>

                  <h3 className={`${estilos.textoTinta} mt-6 text-lg font-bold`}>
                    {paso.titulo}
                  </h3>
                  <p className={`${estilos.textoMedia} mt-3 leading-relaxed`}>{paso.texto}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* CIERRE */}
        <section className="px-4 pb-24 sm:pb-28">
          <div
            className={`${estilos.bordeGradiente} relative mx-auto max-w-4xl overflow-hidden rounded-[2rem] px-8 py-16 text-center sm:px-14`}
          >
            <div aria-hidden="true" className={estilos.aurora} />

            <h2
              className={`${estilos.titular} ${estilos.textoTinta} relative text-3xl font-bold text-balance sm:text-4xl`}
            >
              Tu dinero ya tiene lugar en la vida real.{' '}
              <span className={estilos.degradado}>Dale un sitio en la pantalla.</span>
            </h2>

            <p
              className={`${estilos.textoMedia} relative mx-auto mt-5 max-w-xl text-lg`}
            >
              Crea tu cuenta gratis y empieza por una cartera. El primer sobre lo pones
              tú.
            </p>

            <div className="relative mt-10 flex flex-col justify-center gap-3.5 sm:flex-row">
              <Link
                href="/registro"
                className={`${estilos.brilloBarrido} ${estilos.brilloLima} ${estilos.fondoLima} ${estilos.textoFondo} inline-flex items-center justify-center gap-2 rounded-2xl px-7 py-4 text-base font-bold transition-transform hover:scale-[1.02]`}
              >
                <span className="relative z-10">Crear mi cuenta</span>
                <Icono nombre="flecha" className="relative z-10 h-4 w-4" />
              </Link>

              <Link
                href="/entrar"
                className={`${estilos.vidrio} ${estilos.textoTinta} inline-flex items-center justify-center rounded-2xl px-7 py-4 text-base font-semibold transition-colors hover:bg-white/12`}
              >
                Ya tengo cuenta, entrar
              </Link>
            </div>

            <p
              className={`${estilos.textoTenue} relative mt-8 inline-flex items-center gap-2 text-sm`}
            >
              <Icono nombre="palomita" className={`h-4 w-4 ${estilos.textoLima}`} />
              Empiezas con una cartera en pesos mexicanos.
            </p>
          </div>
        </section>
      </main>

      <footer className={`border-t ${estilos.bordeTenue} px-4 py-10`}>
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 sm:flex-row">
          <span className={`${estilos.textoTinta} font-cifra font-bold`}>Sobres</span>
          <p className={`${estilos.textoTenue} text-sm`}>
            Finanzas personales con sobres de presupuesto.
          </p>
        </div>
      </footer>
    </div>
  )
}