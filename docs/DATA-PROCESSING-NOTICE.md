# DATA-PROCESSING-NOTICE.md — nota de tratamento de dados pessoais

Copyright © 2026 Pedro Alexandre. Proprietary — see ../LICENSE.

**Não é aconselhamento jurídico.** É uma nota interna, escrita a partir de uma medição real
do que este sistema faz hoje — não de um modelo genérico. Se a app deixar o piloto e passar a
ser usada pela empresa, este texto tem de passar por quem trata de protecção de dados na
Condat antes de valer como política formal.

Servida na app, em inglês, em `/privacy` — este ficheiro é a fonte, em português. Cada
afirmação abaixo tem origem medida (item 42, 2026-09-16); nada aqui descreve uma intenção,
só o que foi confirmado directamente contra o schema, o código, os containers e o host.

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
| Nome, email | `tmsi.profiles` | a própria pessoa (a sua linha); `admin` (todas); indirectamente, `finance`/`branch_manager`/`viewer` via `tmsi.audit_log` (ver linha abaixo) | dump nocturno; `audit_log` quando o perfil muda | indefinido — sem apagamento |
| Password | `auth.users.encrypted_password` (hash, nunca em texto simples) | ninguém directamente — só o GoTrue a compara no login | dump nocturno (o hash, nunca a password) | enquanto a conta existir |
| Papel, filial/canal | `tmsi.user_roles` | a própria pessoa; `admin` (todas) | dump nocturno | indefinido |
| Sessões (IP, browser) | `auth.sessions` | ninguém via ecrã da app — só quem tem acesso directo à base de dados | dump nocturno | enquanto a sessão for válida; sessões expiradas confirmadas limpas pelo próprio GoTrue |
| Quem fez o quê, quando (produtos, preços, config, perfis) | `tmsi.audit_log` | `admin`/`finance`/`branch_manager`/`viewer` — o ecrã `/audit` só mostra data/autor/tabela/acção, nunca o conteúdo da alteração; **um pedido directo à API pode obter o conteúdo completo**, incluindo nome/email de um colega sempre que o perfil dele mudou | dump nocturno; API directa (ver nota) | **hoje: indefinido. Decidido: 5 anos — implementação por fazer, item 49** |
| Registo interno de login do GoTrue (email, hora, tipo de evento) | `auth.audit_log_entries` | só por acesso directo à base de dados | dump nocturno | indefinido — sem purga observada |
| Ficheiro gerado num export (Excel/PDF) | não guardado — gerado por pedido | quem o pede | o ficheiro inclui `generatedBy`, o email/id de **quem o gerou**, nunca de terceiros | não aplicável (não persiste no servidor) |
| Registos de acesso ao servidor (IP real do visitante, URL, browser) | `/var/log/nginx/*.log`, no host | só contas do sistema operativo com privilégio (não a app) | — | **14 dias** (rotação diária, confirmada em `/etc/logrotate.d/nginx`) |
| Registos dos containers (aplicação, autenticação) | `docker logs` | só quem tem acesso ao host | — | **por volume, não por tempo** — até 30 MB por container (`max-size 10m × max-file 3`); o registo de autenticação (GoTrue) inclui o email de quem entra em quase todas as linhas; o registo da aplicação não mostrou dados pessoais na amostra verificada |
| Cópia diária completa da base de dados | `~/backups/tmsi/*.dump`, no host | qualquer conta local do sistema operativo (ficheiro **legível por omissão**, achado registado — item 48) | — | **30 dias** (apagamento automático confirmado no serviço de backup) |
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
- **Apagar ou anonimizar uma conta por completo** — não existe. Um pedido de apagamento
  seria hoje feito manualmente, directo à base de dados, fora de qualquer ecrã da app.
  Registado como `docs/BACKLOG.md` item 45.
- **Entregar a uma pessoa, em ficheiro, todos os dados que o sistema tem sobre ela** — não
  existe um botão "os meus dados". Registado como item 46.

## 5. Achados desta medição, registados, não corrigidos aqui

- `tmsi.audit_log` sem retenção implementada (secção 1, item 49 a criar).
- Sem mecanismo de apagamento de utilizador (item 45).
- Sem exportação dos próprios dados (item 46).
- Um pedido directo à API (não o ecrã) pode obter o conteúdo completo de uma alteração de
  perfil (nome/email) por quatro papéis, não só `admin` (item 47).
- Os dumps nocturnos, no host, são legíveis por qualquer conta local do sistema operativo, não
  só pelo dono do ficheiro (item 48).

Nenhum destes é tratado como incidente de segurança — nenhum está acessível a alguém sem
autorização legítima de acesso a este servidor ou a estes papéis dentro da aplicação. São
lacunas de processo/retenção, registadas para decisão e trabalho futuro.
