# Execução formal n.º 1 — VERIFICATION-PROTOCOL.md — 2026-09-05

Registo completo (tabela da secção 6, entrada da secção 7): `docs/VERIFICATION-PROTOCOL.md`.
Este directório guarda só a evidência de suporte.

- **`api-tests-raw-log.txt`** — output real do `psql` para todos os testes de API (G, H, I, J,
  K–N, O–R, U, e as partes de API de A/B/E), com claims JWT reais injectadas por papel
  (`BEGIN`/`SAVEPOINT`/`ROLLBACK` — nada persistido). Emails reais redigidos (só a `viewer`,
  conta não-`.test`); todos os outros identificadores são UUIDs ou dados fictícios do seed
  `(test)`.
- **Evidência de browser (F2, blocos A/B/E/F/S/T/V):** verbal, reportada pelo Pedro no chat
  desta sessão — sem screenshot anexado (nota 1 da secção 6 do protocolo). Sessão 3 (K–N,
  parte visual) foi dispensada por tempo; a parte de API desses quatro papéis está completa
  no log acima.

Sem segredos neste directório (confirmado por grep antes do commit). Sem dados reais de
negócio — só os identificadores fictícios `(test)` do seed e UUIDs de contas de teste.

## Adenda — 2026-09-05 (sessão E5-VPS): tentativa de fechar o desvio S/T (EOP)
Tentativa de libertar a quarentena Microsoft 365/EOP (tenant `@condat.fr`) antes de repetir o
teste de reset de password. **Bloqueada antes do passo da quarentena em si:** o Pedro não tem
acesso/permissões ao portal `security.microsoft.com` para aquele tenant. Não é "a mensagem
voltou à quarentena" (a condição de paragem que o protocolo prevê) — é não haver sequer acesso
para verificar. Não repetido mais de uma vez, conforme a regra de não insistir sem novo dado.
Caminho seguinte: pedido de acesso/libertação à TI do tenant — decisão do Pedro, fora desta
sessão. Detalhe: `docs/VERIFICATION-PROTOCOL.md` secção 7 (adenda) e `docs/STATE.md`.
