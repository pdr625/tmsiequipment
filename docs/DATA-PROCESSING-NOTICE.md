# DATA-PROCESSING-NOTICE.md — nota de tratamento de dados pessoais

Copyright © 2026 Pedro Alexandre. Proprietary — see ../LICENSE.

**Não é aconselhamento jurídico.** É uma nota interna, escrita a partir de uma medição real
do que este sistema faz hoje — não de um modelo genérico. Se a app deixar o piloto e passar a
ser usada pela empresa, este texto tem de passar por quem trata de protecção de dados na
Condat antes de valer como política formal.

Servida na app, em inglês, em `/privacy` — este ficheiro é a fonte, em português. Cada
afirmação abaixo tem origem medida (item 42, 2026-09-16; revista pelos itens 47+48 e 43,
2026-09-16); nada aqui descreve uma intenção, só o que foi confirmado directamente contra o
schema, o código, os containers e o host.

## 1. As duas perguntas que só o responsável pode responder

**Quem é o responsável pelo tratamento, nesta fase de piloto:** Pedro Alexandre, a título
pessoal (pedroalexandre625@gmail.com) — a app corre num VPS pessoal, com domínio pessoal, e a
licença com a Condat está em negociação. Isto **não** é a resposta definitiva para quando a
app deixar o piloto — é a resposta para a fase actual, decidida por quem hoje é responsável de
facto pela infraestrutura.

**Prazo de conservação do `tmsi.audit_log` (o registo de quem alterou o quê, e quando):**
**5 anos** a partir da data de cada entrada. **Isto é o prazo decidido, não o que está
implementado hoje** — a tabela é `append-only` desde a primeira migração, sem mecanismo
nenhum de purga; hoje cresce sem limite. A implementação de um apagamento automático aos 5
anos fica registada como item de backlog próprio (`docs/BACKLOG.md` item 49), não é trabalho
desta sessão.

## 2. Que dados pessoais este sistema guarda, e onde

Tabela medida directamente contra a base de dados de produção, os containers e o host nesta
sessão — não uma lista teórica.

| Dado | Onde vive | Quem lhe acede | Como pode sair | Quanto tempo fica |
|---|---|---|---|---|
| Nome, email | `tmsi.profiles` | a própria pessoa (a sua linha); `admin` (todas, incluindo o histórico de alterações no `audit_log` — ver linha abaixo) | dump nocturno; `audit_log`, só para `admin`, desde a correcção dos itens 47+48 | indefinido — sem apagamento |
| Password | `auth.users.encrypted_password` (hash, nunca em texto simples) | ninguém directamente — só o GoTrue a compara no login | dump nocturno (o hash, nunca a password) | enquanto a conta existir |
| Papel, filial/canal | `tmsi.user_roles` | a própria pessoa; `admin` (todas) | dump nocturno | indefinido |
| Sessões (IP, browser) | `auth.sessions` | ninguém via ecrã da app — só quem tem acesso directo à base de dados | dump nocturno | enquanto a sessão for válida; sessões expiradas confirmadas limpas pelo próprio GoTrue |
| Quem fez o quê, quando (produtos, preços, config, perfis) | `tmsi.audit_log` | `admin`/`finance`/`branch_manager`/`viewer` — o ecrã `/audit` só mostra data/autor/tabela/acção, nunca o conteúdo da alteração; o conteúdo completo (`old_row`/`new_row`) é lido por `tmsi.v_audit_log`, não pela tabela em bruto (fechada por `REVOKE`, itens 47+48, 2026-09-16) — **igual para produtos/preços/configuração** (`finance`/`branch_manager`/`viewer` continuam a ver tudo, sem mudança); **para um perfil de colega, só `admin` vê o nome/email da alteração** — os outros três recebem o valor mascarado (`null`) | dump nocturno; `v_audit_log` via API (mascarado como acima) | **hoje: indefinido. Decidido: 5 anos — implementação por fazer, item 49** |
| Registo interno de login do GoTrue (email, hora, tipo de evento) | `auth.audit_log_entries` | só por acesso directo à base de dados | dump nocturno | indefinido — sem purga observada |
| Ficheiro gerado num export (Excel/PDF) | não guardado — gerado por pedido | quem o pede | o ficheiro inclui `generatedBy`, o email/id de **quem o gerou**, nunca de terceiros | não aplicável (não persiste no servidor) |
| Registos de acesso ao servidor (IP real do visitante, URL, browser), incluindo o registo de tempos `/var/log/tmsi/tmsi-timing.log` (mesmo IP e URL, mais a duração do pedido) | `/var/log/nginx/*.log` e `/var/log/tmsi/tmsi-timing.log`, no host | só contas do sistema operativo com privilégio (não a app) | — | **90 dias** (rotação diária, `rotate 90`, confirmada em `/etc/logrotate.d/nginx` e `/etc/logrotate.d/tmsi-timing`; eram 14 até 2026-09-20, item 66 — texto corrigido a 2026-09-24, item 77) |
| Registos dos containers (aplicação, autenticação) | `docker logs` | só quem tem acesso ao host | — | **por volume, não por tempo** — até 30 MB por container (`max-size 10m × max-file 3`); o registo de autenticação (GoTrue) inclui o email de quem entra em quase todas as linhas; o registo da aplicação não mostrou dados pessoais na amostra verificada |
| Cópia completa da base de dados | `~/backups/tmsi/*.dump`, no host | só `pedro` (`600`/directório `700` desde a correcção do item 48, 2026-09-16, provada numa execução real do serviço — antes, `644`/`775`, mundialmente legível) | — | **item 84, 2026-10-03 — decisão do Pedro, política permanente (substitui a nota do item 43):** cópia **diária, 30 dias** (`tmsi-backup-window.timer`, purga nova por data — não tinha nenhuma até 2026-10-03, era isso que tornava falsa a frase «30 dias» desde 2026-09-19) **mais** cópia **semanal, últimas 8** (~2 meses, `tmsi-backup-weekly.timer`) — os dois regimes correm sempre, já não se alterna um pelo outro. Off-site: a cópia homelab espelha ambos sem alteração (glob `*.dump`). Dumps anteriores ao item 43 (regime antigo de 2026-09-03, já com purga por data) deixaram de ser automaticamente geridos, mantidos como estão. |
| Segredos de infraestrutura cifrados (chaves, não dados pessoais) | `~/backups/tmsi/*.gpg` | só quem tiver a frase-passe | — | não aplicável — não contém dados pessoais, confirmado por leitura da documentação de desastre |

## 3. Para que serve cada tratamento

- **Nome, email, papel, filial/canal:** identificar quem acede à aplicação e o que cada
  pessoa está autorizada a ver, para impor as fronteiras de custo já verificadas
  (`docs/VERIFICATION-PROTOCOL.md`).
- **`tmsi.audit_log`:** provar quem alterou um preço, uma configuração ou um perfil, e quando
  — a base do princípio "toda a escrita fica registada com autor real", central a este
  projecto desde a primeira migração.
- **Sessões, registos de acesso:** funcionamento normal de qualquer aplicação web
  autenticada (manter a sessão, diagnosticar problemas) — não usados para nenhum outro fim.
- **Cópias de segurança:** continuidade do serviço se o VPS falhar — não um arquivo à parte.

Nenhum dado pessoal é usado para nenhuma finalidade fora destas — não há perfilagem, não há
partilha com terceiros, não há uso de marketing.

## 4. O que uma pessoa pode pedir, e a quem

Contacta o responsável (secção 1) para: ver que dados teus o sistema guarda, corrigir um
nome/email errado, ou pedir para deixares de ter uma conta.

**O que o sistema já permite fazer, hoje, quando pedido:**
- Corrigir nome/email — via `/admin/users`, o `admin` edita.
- Desactivar o acesso — botão `Disable` em `/admin/users` (reversível), fecha o login sem
  apagar o histórico de auditoria dessa pessoa (o histórico é o registo que prova quem fez o
  quê — apagá-lo destruiria essa prova para todos, não só para quem pediu).

**O que o sistema ainda não faz — dito sem rodeios, não escondido:**
- ~~Apagar ou anonimizar uma conta por completo~~ — **existe desde 2026-10-07 (item 45, migração 0025).** O `admin` usa «Remove account…» em `/admin/users`
  (confirmação escrevendo o email; irreversível): a conta é apagada no GoTrue (email, hash e sessões desaparecem, o perfil e os papéis caem em cascata) e o
  nome e o email que ficaram no `audit_log` (32 linhas de `profiles`, medido) são redigidos. **O `audit_log` mantém o UUID do autor** — a prova de quem fez o quê —
  que sem perfil já não é ligável a uma pessoa; o `/audit` mostra «Removed user». O que **não** é coberto: o dump nocturno e as cópias off-site
  anteriores à remoção continuam a conter a pessoa até saírem da retenção (30 dias), e os registos de acesso do servidor (IP) seguem a sua própria retenção.
- ~~Entregar a uma pessoa, em ficheiro, os dados que o sistema tem sobre ela~~ — **existe desde 2026-10-07 (item 46, migração 0026):** «Download my data» no menu *Account*
  (`/account/data`) entrega um JSON com o perfil, os papéis, o que a pessoa fez (quando, em que tabela e registo) e o que foi feito à sua conta. Só os dados de quem pede
  (`tmsi.my_data()` olha apenas para `auth.uid()`), nada de terceiros. **Fora do ficheiro, declarado nele:** sessões (IP, browser) e logs do servidor — pedem-se ao responsável —,
  as cópias de segurança (30 dias) e a password (só o hash).

## 5. Achados desta medição

**Corrigidos nesta revisão (itens 47+48, 2026-09-16):**
- O conteúdo de uma alteração de perfil (nome/email de um colega) já não é alcançável por
  `finance`/`branch_manager`/`viewer` via API directa — só `admin`. Medido primeiro se isto
  também alcançava CUSTOS (contornando as fronteiras 0003/0004) — não alcançava: confirmado
  com sessões reais dos três papéis sem custos (`logistics`/`sales`/`agent`), zero linhas
  devolvidas em qualquer caso, por uma política RLS só sua (`admin`/`finance`/`viewer`/
  `branch_manager`, um subconjunto de quem já vê custos). A correcção foi só do ângulo de
  privacidade — migração 0014.
- Os dumps nocturnos deixaram de ser legíveis por qualquer conta local do host — `600`/`700`,
  provado numa execução real do serviço de backup, não só no ficheiro do serviço.

**Registados, por corrigir (sem urgência de fronteira):**
- `tmsi.audit_log` sem retenção implementada (secção 1, item 49 a criar).
- ~~Sem mecanismo de apagamento de utilizador (item 45)~~ — resolvido em 2026-10-07 (secção 4).
- ~~Sem exportação dos próprios dados (item 46)~~ — resolvido em 2026-10-07 (secção 4).

Nenhum destes é tratado como incidente de segurança — nenhum esteve acessível a alguém sem
autorização legítima de acesso a este servidor ou a estes papéis dentro da aplicação. São
lacunas de processo/retenção, registadas para decisão e trabalho futuro.
