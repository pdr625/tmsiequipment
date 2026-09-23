# TEST-ACCOUNTS.md — contas de teste

Copyright © 2026 Pedro Alexandre. Proprietary — see ../LICENSE.

**Nenhuma password está escrita neste ficheiro nem em qualquer ficheiro versionado.** Os valores
vivem em `~/tmp/tmsi-sudo/<papel>-test-password.txt`, `chmod 600`, fora do repo.

---

## Password única partilhada — decisão do Pedro, 2026-09-23

**As seis contas `@example.test` partilham a mesma password até à fase de produção.**

**Porquê:** as contas eram criadas e as passwords mudadas ao longo de sessões de browser, e o
ficheiro de credenciais ficava para trás sem ninguém dar por isso. Aconteceu **duas vezes em três
dias** — `logistics.test` a 2026-09-20 e `finance.test` a 2026-09-22 — e das duas vezes o sintoma
foi o mesmo: os modos de login do smoke a falhar com `http_400`, a parecer regressão de deploy
quando era deriva de credenciais. Uma password única remove a classe inteira do problema enquanto
os dados forem de teste.

**⚠️ A rever antes de existir qualquer conta real.** Esta decisão vale para identidades
fictícias numa instância a que só o Pedro acede. **Não se estende a uma conta de uma pessoa
real** — nem para "facilitar o arranque", nem temporariamente. Quando o piloto avançar (item 57,
adiado pelo Pedro a 2026-09-05), cada conta real nasce com password própria e
`must_change_password = true`.

---

## As seis contas

| Conta | Papel | Âmbito |
|---|---|---|
| `finance.test@example.test` | `finance` | lê custos, todas as filiais |
| `pm.test@example.test` | `product_manager` | lê custos, escreve produtos |
| `branch_manager.test@example.test` | `branch_manager` | filial CORP |
| `logistics.test@example.test` | `logistics` | operacional, **sem** custos |
| `sales.sa@example.test` | `sales` | filial SA, **sem** custos |
| `agent.apac@example.test` | `agent` | canal APAC, **sem** custos |

Todas: `must_change_password = false`, email confirmado, nenhuma banida — verificado antes e
depois da uniformização.

**Papéis sem conta:** `admin` (é a conta pessoal do Pedro) e `viewer` (nunca teve conta — o smoke
concede-o dentro de uma transacção revertida, bloco CC).

---

## Ficheiros de credenciais

`~/tmp/tmsi-sudo/<papel>-test-password.txt` — um por conta, `600`, **sem newline final**
(12 bytes, 0 linhas). O `scripts/smoke.py` lê-os nos modos `login` e omisso; o modo `jwt` não
precisa deles (cunha tokens a partir dos uuids de `tmsi.profiles`).

**Inspeccionar um destes ficheiros: só `wc -c`, `wc -l` e `stat`.** Nunca `cat`, `head`, `tail`,
`od`, `xxd` — nem parciais. A regra e as três recidivas que a motivaram estão em
`~/atelier-vps/CLAUDE.md`.

---

## Quando um login de conta `.test` devolver `http_400`

**Não é regressão de deploy até se provar que é.** Primeiro passo, sempre:

```sql
select email, updated_at from auth.users where email like '%@example.test';
```

e comparar com o `mtime` do ficheiro correspondente (`stat -c '%y'`). Se o GoTrue for **mais
recente** que o ficheiro, a password foi mudada numa sessão de browser e o ficheiro ficou para
trás — foi o que aconteceu das duas vezes. Avisar o Pedro antes de continuar.
