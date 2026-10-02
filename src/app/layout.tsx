import type { Metadata } from 'next'
import { Inter, Plus_Jakarta_Sans } from 'next/font/google'
import './globals.css'

/*
 * Las dos tipografias del sistema de diseno: Plus Jakarta Sans para cifras y
 * titulares, Inter para texto y tablas. `next/font` las autoaloja, asi que en
 * Vercel no hay peticion a un tercero ni salta el CLS.
 */
const fuenteCifra = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--fuente-cifra',
  display: 'swap',
})

const fuenteTexto = Inter({
  subsets: ['latin'],
  variable: '--fuente-texto',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Finanzas',
  description: 'Finanzas personales con sobres de presupuesto',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="es"
      className={`${fuenteCifra.variable} ${fuenteTexto.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-lienzo text-texto antialiased">
        {/*
          El tema elegido se aplica antes del primer pintado para que no haya un destello del
          tema por defecto: el CSS lo lee de `data-tema` en `<html>`, y sin esto el navegador
          pintaria oscuro y recien despues de hidratar saltaria a claro. Va como script inline
          y en linea, sin `next/script`, porque necesita correr de forma sincronica.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('tema');if(t==='claro'||t==='oscuro'){document.documentElement.dataset.tema=t}}catch(e){}",
          }}
        />
        {children}
      </body>
    </html>
  )
}
