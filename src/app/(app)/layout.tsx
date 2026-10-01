import { Navegacion } from '@/components/navegacion'

/**
 * Shell comun de las pantallas con sesion.
 *
 * Antes no existia: cada pagina de `(app)` renderizaba su propio `<main>` y no
 * habia ni barra ni salida. El layout aporta la navegacion y nada mas.
 *
 * No protege nada. `sesionActual()` ya lo hace cada pagina, y repetirlo aqui
 * seria una segunda consulta a la base en cada render sin agregar seguridad:
 * quien no tiene sesion igual aterriza en `/entrar` por el guard de la pagina.
 */
export default function LayoutDeSesion({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-lienzo">
      <Navegacion />
      {children}
    </div>
  )
}