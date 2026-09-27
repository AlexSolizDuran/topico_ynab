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
    <html lang="es" className={`${fuenteCifra.variable} ${fuenteTexto.variable}`}>
      <body className="min-h-screen bg-lienzo text-texto antialiased">{children}</body>
    </html>
  )
}
