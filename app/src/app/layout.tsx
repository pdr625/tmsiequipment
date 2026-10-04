/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

import type { Metadata } from 'next';
import { Geist, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { getBranding } from '@/lib/branding';
import { ThemeToggle } from './theme-toggle';

// Tipos de letra do Itinera (Geist + JetBrains Mono), servidos do PRÓPRIO
// domínio: o next/font descarrega-os no build (CI) e emite-os como ficheiros
// estáticos em /_next/static/media. Assim cumpre o CSP (`font-src 'self'`) e
// não há nenhum pedido a terceiros em runtime — importa numa app com aviso de
// tratamento de dados (/privacy).
const geist = Geist({ subsets: ['latin'], variable: '--font-geist', display: 'swap' });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains', display: 'swap' });

// Corre ANTES da primeira pintura (inline no <head>), para o tema certo estar
// no <html> quando o CSS é aplicado — sem este script a página piscava de
// claro para escuro. Preferência guardada em localStorage ('light'|'dark');
// sem ela segue o sistema. O CSP actual permite scripts inline.
const THEME_INIT = `(function(){try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.setAttribute('data-theme',t)}catch(e){}})()`;

// item 26: dynamic instead of a literal string — every request re-reads
// tmsi.v_current_branding (anon-readable, 0008), so a fresh session even
// before login already shows the configured name in the browser tab.
export async function generateMetadata(): Promise<Metadata> {
  const branding = await getBranding();
  return {
    title: branding.displayName,
    robots: 'noindex, nofollow',
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: o script de tema muda o atributo data-theme do
    // <html> antes de o React hidratar; é a única diferença servidor/cliente.
    <html lang="en" className={`${geist.variable} ${jetbrains.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className="min-h-screen bg-page font-sans text-fg antialiased">
        {children}
        <ThemeToggle />
      </body>
    </html>
  );
}
