export default function Portada() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6 py-16">
      <div className="rounded-tarjeta border border-borde bg-superficie p-8 shadow-nivel-1">
        <p className="text-xs font-semibold tracking-wide text-texto-tenue uppercase">
          Finanzas personales
        </p>
        <h1 className="cifra mt-2 text-4xl font-bold tracking-tight">
          Sobres de presupuesto
        </h1>
        <p className="mt-3 text-texto-medio">
          Cada peso recibe un destino antes de gastarse. El disponible de un sobre
          nunca se guarda: se calcula desde asignaciones y movimientos, as&iacute; que
          corregir el pasado repara el presente.
        </p>
      </div>

      <div className="rounded-tarjeta border border-borde bg-superficie p-8 shadow-nivel-1">
        <h2 className="text-lg font-semibold">Estado</h2>
        <p className="mt-2 text-texto-medio">
          El sistema se construye por changes de OpenSpec, en orden de dependencias.
          Cada change implementa una capacidad contra los specs que ya est&iacute;n
          escritos y verificados.
        </p>
        <ul className="mt-4 space-y-2 text-sm text-texto-medio">
          <li>
            <code className="rounded bg-superficie-tenue px-1.5 py-0.5">000-base</code>{' '}
            andamiaje, regla del dinero y arn&eacute;s de pruebas
          </li>
          <li>
            <code className="rounded bg-superficie-tenue px-1.5 py-0.5">010-auth</code>{' '}
            autenticaci&oacute;n a mano sobre Postgres
          </li>
          <li>
            <code className="rounded bg-superficie-tenue px-1.5 py-0.5">050-sobres</code>{' '}
            el n&uacute;cleo: disponible derivado e invariante del patrimonio
          </li>
          <li>
            <code className="rounded bg-superficie-tenue px-1.5 py-0.5">110-panel</code>{' '}
            el resumen de solo lectura
          </li>
        </ul>
      </div>
    </main>
  )
}
