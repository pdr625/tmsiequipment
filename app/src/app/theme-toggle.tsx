/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

'use client';

import { useEffect, useState } from 'react';

type Choice = 'system' | 'light' | 'dark';
const ORDER: Choice[] = ['system', 'light', 'dark'];
const LABEL: Record<Choice, string> = { system: 'Auto', light: 'Light', dark: 'Dark' };

function systemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function apply(choice: Choice) {
  document.documentElement.setAttribute('data-theme', choice === 'system' ? systemTheme() : choice);
}

function stored(): Choice {
  try {
    const t = localStorage.getItem('theme');
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
}

// Seletor de tema: Auto (segue o sistema) → Light → Dark. Dois sítios:
//   inline   — rodapé do menu lateral (páginas autenticadas, app-shell.tsx);
//   floating — canto inferior direito, para as páginas SEM menu lateral
//              (login, recuperação, troca forçada de password). Escondido na
//              impressão.
// (Antes da barra lateral era um botão flutuante provisório em todas.)
// A escolha inicial é lida DEPOIS de montar (useEffect) para o HTML do
// servidor e o primeiro render do cliente coincidirem; o aspecto do tema em
// si já foi aplicado pelo script inline do layout.
export function ThemeToggle({ variant = 'floating' }: { variant?: 'floating' | 'inline' }) {
  const [choice, setChoice] = useState<Choice>('system');

  useEffect(() => {
    setChoice(stored());
  }, []);

  // Em «Auto», acompanha a mudança do sistema enquanto a página está aberta.
  useEffect(() => {
    if (choice !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => apply('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [choice]);

  function next() {
    const n = ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length];
    try {
      if (n === 'system') localStorage.removeItem('theme');
      else localStorage.setItem('theme', n);
    } catch {
      /* armazenamento bloqueado: o tema aplica-se na mesma, só não persiste */
    }
    apply(n);
    setChoice(n);
  }

  return (
    <button
      type="button"
      onClick={next}
      aria-label={`Theme: ${LABEL[choice]}. Click to change.`}
      title={`Theme: ${LABEL[choice]}`}
      className={
        variant === 'inline'
          ? 'w-full cursor-pointer rounded-md border border-nav-line px-3 py-1.5 text-left text-xs font-medium text-nav-fg hover:text-nav-fg-hover'
          : 'fixed bottom-4 right-4 z-50 cursor-pointer rounded-full border border-line-strong bg-surface px-3 py-1.5 text-xs font-medium text-fg-soft shadow-sm print:hidden'
      }
    >
      {choice === 'dark' ? '☾' : choice === 'light' ? '☀' : '◐'} {LABEL[choice]}
    </button>
  );
}
