import '@fontsource-variable/dm-sans'
import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Memoria',
  description: 'La memoria de cada cliente de tu agencia.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-MX">
      <body>{children}</body>
    </html>
  )
}
