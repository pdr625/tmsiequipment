# TEST-ACCOUNTS.md — contas `.test` fictícias e a sua desactivação

Copyright © 2026 Pedro Alexandre. Proprietary — see ../LICENSE.

Item 40. Não escrito porque as contas vão ser desactivadas agora — **não vão**, por decisão
do Pedro de 2026-09-06: ficam vivas até à apresentação à equipa. Este ficheiro é o
procedimento pronto a seguir **nesse dia**, e o registo de porque é seguro fazê-lo.

## O que são

| Conta | Papel | branch_id | Usada por |
|---|---|---|---|
| `finance.test@example.test` | `finance` | — | `scripts/smoke.py` (login) |
| `pm.test@example.test` | `product_manager` | — | `scripts/smoke.py` (login) |
| `logistics.test@example.test` | `logistics` | — | `scripts/smoke.py` (login) |
| `branch_manager.test@example.test` | `branch_manager` | `CORP` | `scripts/smoke.py` (login) |
| `sales.sa@example.test` | `sales` | `SA` | protocolo (manual/API) **e `smoke.py` bloco CC** desde 2026-09-19 |
| `agent.apac@example.test` | `agent` | canal `APAC` | protocolo (manual/API) **e `smoke.py` bloco CC** desde 2026-09-19 |

**`sales` e `agent` não têm ficheiro de password** — e continuam a não precisar de um. O bloco CC
do smoke exercita-os por injecção de claims no `psql` (o método que o `CLAUDE.md` do VPS prescreve
para provas de RLS/dados), não por login, o que também faz o bloco comportar-se igual nos três
modos de verificação.

**`viewer` e `admin` não têm conta nenhuma, e não é preciso criarem-se.** Os dois papéis são
exercidos por uma concessão **dentro de uma transacção que é revertida** — `viewer` no bloco CC
(concedido a uma conta sem acesso a custos, para medir a diferença antes/depois) e `admin` no
bloco BB (para provar que o conteúdo de auditoria que fica mascarado a um não-admin aparece a um
admin). Nada é comitado; o resíduo é verificado no fim de cada execução. Criar uma conta `admin`
com login em produção seria um risco desnecessário para o que estas duas asserções provam.

Todas fictícias (`@example.test`, um domínio reservado pela IANA para isto, nunca resolve).
Nenhuma corresponde a uma pessoa real. Existem para provar a matriz de 8 papéis do
`VERIFICATION-PROTOCOL.md` e para o smoke suite exercitar RLS/regras de negócio como cada
papel realmente as vê — não para uso operacional.

**Quatro** contas reais também existem no sistema (medido 2026-09-19, corrigindo o "três" que
aqui estava): a do Pedro, única com papel `admin`, e **três sem papel nenhum** — um endereço
pessoal alternativo, um endereço corporativo `condat.fr`, e um alias `+verifiteste` do endereço
principal, este último visivelmente criado para testar o fluxo de verificação por email. Este
documento não as cobre — não são `.test`, não são fictícias, ficam de fora de qualquer
desactivação por definição. **Sem papel, nenhuma delas vê seja o que for** (toda a leitura de
produtos e preços passa por `has_role()`), por isso não são uma fuga; são higiene por fazer —
`docs/BACKLOG.md` item 57.

## O que se perde ao desactivar — antes e depois do item 40

**Antes do item 40 (F1), perdia-se tudo:** `scripts/smoke.py` fazia sempre login real
(`POST /auth/v1/token?grant_type=password`) para as quatro primeiras contas da tabela — uma
conta desactivada (banida) fazia esse pedido falhar, e o script **abortava antes do primeiro
teste**, sem nenhum resultado. A rede de segurança do deploy dependia inteiramente de contas
vivas.

**Depois do item 40 (F1), perde-se nada, por omissão continua igual e há um modo que não
depende de login nenhum:**

```
TMSI_VERIFY_MODE=jwt python3 scripts/smoke.py
```

Neste modo o script nunca chama `/auth/v1/token` — assina localmente um JWT HS256 para o
mesmo `user_id` de cada conta (já resolvido via `tmsi.profiles`, não via login), com o
`JWT_SECRET` real do stack (lido de `deploy/supabase/.env`, nunca duplicado, nunca impresso).
Testa exactamente os mesmos papéis/RLS — só a forma de obter um bearer token muda. Provado
neste item com as contas **simuladas indisponíveis** (`TMSI_CREDENTIALS_DIR` apontado para um
caminho inexistente): **62/62**, idêntico ao modo por omissão. Detalhe: `docs/STATE.md`,
secção do item 40.

`TMSI_VERIFY_MODE=login` (ou a omissão, sem variável nenhuma) continua a fazer login real —
sem alteração de comportamento — e vai voltar a falhar se as contas estiverem banidas. **Depois
de desactivar, corre sempre com `TMSI_VERIFY_MODE=jwt`** (ou exporta a variável no `.bashrc` do
`pedro` nesta VPS, para não teres de te lembrar em cada corrida).

## O que se perde de facto — não é o smoke, é o browser

`docs/VERIFICATION-PROTOCOL.md`, passos **S** e **T** da matriz (`Execução n.º 1`), testam o
**login real** em si — convite chega, link sobrevive, password funciona, reset funciona — via
browser, com o Pedro a confirmar. Isso, por definição, precisa de uma conta que consiga
autenticar-se de verdade. Desactivar as `.test` **fecha essa porta** para essas duas provas
especificamente: o item 41 (re-execução completa do protocolo) não vai conseguir repeti-las
com estas contas depois de desactivadas. Não é um problema do mecanismo — é a natureza do que
os passos S/T verificam. Duas saídas, nenhuma decidida aqui: reactivar uma conta `.test`
só pelo tempo desse par de passos (reversível, `Reactivate` no mesmo ecrã), ou usar uma conta
nova, criada e apagada só para essa prova. Fica para quem correr o item 41 decidir.

## `tmsi.profiles.active` não é o mecanismo

A coluna existe (`tmsi.profiles.active boolean not null default true`) mas **não é lida em
lado nenhum** — nenhuma política RLS, nenhuma função, nenhum middleware a consulta (confirmado
por grep ao schema e ao `app/src` inteiro, item 40 F0). Mudá-la para `false` não bloquearia
login nem acesso a nada. **Não é o botão de desactivar** — fica registado aqui para não ser
confundido com um no futuro.

## Procedimento de desactivação (para o Pedro correr, quando decidir)

1. `/admin/users`, como admin.
2. Para cada uma das seis contas da tabela acima: botão **Disable** na respectiva linha
   (chama a Admin API do GoTrue, `ban_duration: 876000h` — efectivamente permanente, e
   **reversível**: o mesmo botão passa a ler `Reactivate`).
3. Confirmar (opcional, ao vivo): `TMSI_VERIFY_MODE=login python3 scripts/smoke.py` falha logo
   no primeiro login — prova que a desactivação teve efeito real no GoTrue, não só na UI.
4. Passar a correr o smoke sempre com `TMSI_VERIFY_MODE=jwt` daqui para a frente.

Nenhum destes passos apaga a conta, a `tmsi.profiles`, o `user_roles` nem o histórico em
`audit_log` — só fecha a porta do login. Reactivar é o mesmo botão, ao contrário.
