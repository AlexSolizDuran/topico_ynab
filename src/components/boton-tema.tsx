'use client'

/**
 * Boton que alterna entre tema oscuro (por defecto) y claro.
 *
 * El tema vive en `data-tema` sobre `<html>`: `claro` u `oscuro`. El CSS lo lee con
 * `html[data-tema='claro']`, sin JavaScript, asi que no hay estado de React que mantener
 * sincronizado con el diseno. Lo unico que este boton guarda es la eleccion en `localStorage`,
 * y el script de `layout.tsx` la vuelve a aplicar antes del primer pintado para que no haya
 * parpadeo.
 *
 * El primer render del servidor no sabe el tema (depende del navegador), asi que arranca en
 * "oscuro" y `useEffect` corrige el icono despues de montar. Server y primer render del cliente
 * coinciden, y no hay error de hidratacion.
 */

import { useEffect, useState } from 'react'
import tema from './tema-oscuro.module.css'

const CLAVE = 'tema'

export function BotonTema() {
  const [claro, setClaro] = useState(false)

  useEffect(() => {
    setClaro(document.documentElement.dataset.tema === 'claro')
  }, [])

  function alternar() {
    const siguiente = !claro
    setClaro(siguiente)
    document.documentElement.dataset.tema = siguiente ? 'claro' : 'oscuro'
    try {
      window.localStorage.setItem(CLAVE, siguiente ? 'claro' : 'oscuro')
    } catch {
      /* Modo privado sin almacenamiento: el tema vale para esta pestana igual. */
    }
  }

  const etiqueta = claro ? 'Activar tema oscuro' : 'Activar tema claro'

  return (
    <button
      type="button"
      onClick={alternar}
      aria-label={etiqueta}
      title={etiqueta}
      aria-pressed={claro}
      className={tema.botonTema}
    >
      <span aria-hidden="true">{claro ? '\u263e' : '\u2600'}</span>
    </button>
  )
}
