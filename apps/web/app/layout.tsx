import '@/styles/globals.css'
import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import localFont from 'next/font/local'
import LiveTabName from '@/components/live-tabname'
import Providers from '@/components/providers'

const abcGravityItalic = localFont({
  src: '../fonts/ABCGravity-ExtendedItalic-Trial.otf',
  variable: '--font-abc-gravity-italic',
})

const geist = Geist({
  subsets: ['latin'],
  variable: '--font-geist',
})

export const metadata: Metadata = {
  title: 'Rizz Club | BTC',
  icons: {
    icon: '/icon.png',
  },
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${geist.className} ${abcGravityItalic.variable} antialiased `}>
        <Providers>
          <LiveTabName />
          {children}
        </Providers>
      </body>
    </html>
  )
}
