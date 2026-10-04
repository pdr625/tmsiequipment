/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { activeHref, type NavSection } from '@/lib/nav';
import { ThemeToggle } from '../theme-toggle';

// Barra lateral (desktop) / gaveta com cabeçalho (telemóvel), na linha do
// Itinera: trilho azul-marinho, «pílula» coral antes da marca, item activo a
// coral. As entradas são <a href> com router.push no clique — NÃO <Link>:
// o item 81 mediu que o prefetch (por viewport E por hover) custava um render
// completo no servidor por entrada, e `prefetch={false}` não desliga o de
// hover. Um <a> simples não pré-carrega nada, e ainda dá o que o antigo
// MenuButton perdia: abrir num novo separador com o botão do meio / Ctrl+clique.
export function AppShell({
  brand,
  userLabel,
  sections,
  children,
}: {
  brand: string;
  userLabel: string;
  sections: NavSection[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const active = activeHref(pathname, sections);

  // A gaveta fecha ao navegar e com Escape.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  function go(e: React.MouseEvent<HTMLAnchorElement>, href: string) {
    // Deixa o browser tratar Ctrl/Cmd/Shift-clique e o botão do meio (novo separador).
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    router.push(href);
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 flex h-[54px] items-center gap-3 border-b border-line bg-surface px-4 md:hidden print:hidden">
        <button
          type="button"
          aria-label="Open menu"
          aria-expanded={open}
          aria-controls="app-sidebar"
          onClick={() => setOpen(true)}
          className="cursor-pointer rounded-md border border-line-strong px-2.5 py-1 text-lg leading-none text-fg"
        >
          ☰
        </button>
        <span className="flex items-center gap-2 text-base font-extrabold tracking-tight text-fg">
          <span aria-hidden className="h-5 w-1.5 rounded-full bg-accent" />
          {brand}
        </span>
      </header>

      {open && (
        <div aria-hidden className="fixed inset-0 z-30 bg-black/50 md:hidden print:hidden" onClick={() => setOpen(false)} />
      )}

      <aside
        id="app-sidebar"
        className={`fixed inset-y-0 left-0 z-40 flex w-[232px] flex-col border-r border-nav-line bg-nav text-nav-fg transition-transform md:translate-x-0 print:hidden ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-2 border-b border-nav-line px-5 pb-4 pt-[18px] text-base font-extrabold tracking-tight text-nav-fg-hover">
          <span aria-hidden className="h-[22px] w-1.5 shrink-0 rounded-full bg-accent" />
          <span className="truncate">{brand}</span>
        </div>

        <nav aria-label="Main" className="flex-1 overflow-y-auto py-3">
          {sections.map((s) => (
            <div key={s.title} className="mb-3">
              <div className="px-5 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.1em] text-nav-fg">
                {s.title}
              </div>
              {s.items.map((i) => {
                const isActive = i.href === active;
                return (
                  <a
                    key={i.href}
                    href={i.href}
                    onClick={(e) => go(e, i.href)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`block border-l-2 px-5 py-2 text-sm ${
                      isActive
                        ? 'border-accent bg-nav-active-bg font-medium text-nav-active-fg'
                        : 'border-transparent text-nav-fg hover:text-nav-fg-hover'
                    }`}
                  >
                    {i.label}
                  </a>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="space-y-2 border-t border-nav-line p-4">
          <div className="truncate text-xs text-nav-fg" title={userLabel}>
            {userLabel}
          </div>
          <ThemeToggle variant="inline" />
          <form action="/logout" method="post">
            <button
              type="submit"
              className="w-full cursor-pointer rounded-md border border-nav-line px-3 py-1.5 text-left text-xs font-medium text-nav-fg hover:text-nav-fg-hover"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="md:pl-[232px] print:pl-0">{children}</main>
    </div>
  );
}
