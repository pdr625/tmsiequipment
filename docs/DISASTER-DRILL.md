# Ensaio de restauro completo (desastre simulado) — execução n.º 1

Copyright © 2026 Pedro Alexandre. Proprietary — see LICENSE.

**Data:** 2026-09-05/06 · **Onde:** homelab (`192.168.1.100`), não o VPS · **Item:** BACKLOG 15
**Veredicto:** os **dados** sobrevivem e voltam a servir; o **procedimento documentado não**.

## Porquê no homelab

O cenário é «o VPS morreu». O ensaio corre onde a recuperação correria, com os materiais que
sobreviveriam: o dump off-site, o repo no GitHub e os registries públicos. O homelab tem ainda a
folga de RAM (24 GB) que o VPS (961 MB) não tem para um ambiente paralelo.

**Nada foi copiado do VPS vivo.** O ambiente correu isolado (projecto `tmsi-drill`, rede própria
`172.31.240.0/24`, portas altas só na LAN, segredos novos gerados no acto) e foi desmontado no
fim. O domínio de produção foi apontado a `127.0.0.1` dentro do container da app, para garantir
que o ensaio não conseguia tocar na produção nem por acidente.

## Métrica

**RTO medido: 13 min 21 s**, do ambiente vazio à camada de dados + API funcional. Inclui **dois
restauros falhados e diagnosticados**; com o procedimento correcto em mãos é substancialmente
menor. Não cobre a app (ver Achado 3) nem DNS/TLS.

**RPO observado:** o dump é das 03:30. O utilizador `branch_manager.test`, criado nesse mesmo dia
mais tarde, **não está no dump** — a janela de perda é real e mede-se em horas, não em minutos.

## Inventário do plano de desastre (F0)

| Item | Sobrevive? | Onde |
|---|---|---|
| Dump da BD | ✅ | off-site no homelab, `/mnt/backup-vps/tmsi` (disco `WD-WXG1A66RKFVN`) |
| Migrações, seed, `roles.sql`, `jwt.sql` | ✅ | git |
| Compose real da stack | ✅ | git (`deploy/supabase/docker-compose.yml`) |
| Imagens PG / GoTrue / PostgREST | ✅ | registries públicos |
| Imagem da app | ✅ | GHCR — **e é pública**, ver Achado 4 |
| **Segredos (`.env` do VPS)** | ❌ | **só no VPS** — `JWT_SECRET`, `POSTGRES_PASSWORD`, SMTP |
| **Vhost nginx** | ❌ | **só no VPS**, não versionado |
| **Passwords dos utilizadores `.test`** | ❌ | **só no VPS** (`~/tmp/tmsi-sudo/`) |
| Procedimento de restauro correcto | ❌ | não existia escrito — este documento é o primeiro |

## O que correu bem

- **Restauro fiel.** 38 POLICY (igual ao metadata do dump), 8 funções críticas presentes e todas
  `SECURITY DEFINER` (as correcções 0002/0003 sobreviveram), 20 tabelas `tmsi`, 7 utilizadores.
- **A fronteira de custos 0003/0004 sobreviveu ao transplante**, com segredos completamente
  novos: `sales.sa` vê 7 linhas com **todos** os campos de custo a `NULL`; `finance.test` vê 13
  com valores reais. Na tabela crua, `exw_price` dá **403 pela BD** a ambos — a vista é o único
  caminho, como desenhado.
- **O motor calcula no ambiente novo:** `compute_price('T-0002','SA')` → `min_price 189.0` para
  ambos os papéis, com `exw_local`/`fx_used`/`interco` mascarados para `sales.sa`.
- **Os hashes bcrypt são independentes do JWT secret**, como esperado: o GoTrue leu os
  utilizadores restaurados e emitiu tokens com um `JWT_SECRET` gerado de raiz.
- **`SERVICE_ROLE_KEY` não está na imagem** — continua a ser env de runtime. Higiene confirmada.

## Achados

### 🔴 1 — O procedimento documentado produz uma BD meio-restaurada, em silêncio
`DEPLOY.md` §7 diz «restore the last dump with `pg_restore`» sem indicar utilizador. Feito
literalmente com `-U postgres`: **441 erros, `rc=1`**. Causa: nesta imagem **`postgres` não é
superuser** (`rolsuper=f`); o superuser é `supabase_admin`. O perigo não é o erro — é ser
plausível descartá-lo como «ruído normal do pg_restore» e ficar com metade do schema.

### 🔴 2 — `--no-owner` parte o GoTrue
Com `--no-owner`, as 23 tabelas `auth.*` ficam do `supabase_admin` em vez do
`supabase_auth_admin`. O GoTrue arranca, falha por privilégio o `select` que verifica se as
migrações existem, conclui que tem de as criar, e morre em
`relation "schema_migrations" already exists`. A mensagem não aponta para o problema real.

**Procedimento correcto, provado neste ensaio (`rc=0`, 0 erros):**
```bash
docker exec -i <db> pg_restore -U supabase_admin -d postgres --clean --if-exists < tmsi-<data>.dump
```
Sem `--no-owner`. Verificar a seguir: `auth.*` do `supabase_auth_admin`, `tmsi.*` do `postgres`.

### 🔴 3 — A imagem de produção não pode ser reapontada
O chunk do servidor contém o literal `("https://tmsiequipment.duckdns.org","eyJhbGciO…` — URL do
Supabase **e** anon key compilados no build (`NEXT_PUBLIC_*` são inlined pelo Next.js), sem
qualquer variável de runtime que os sobreponha. Restaurar noutro hostname, ou com segredos novos,
**exige refazer a imagem por CI** — passo que não estava no plano nem medido.
*Nuance que torna a correcção barata:* o URL **não** está no bundle do cliente. A app fala com o
Supabase **só do lado do servidor**, portanto basta lê-lo de env de runtime em vez de
`NEXT_PUBLIC_*`. → BACKLOG 22.

### 🟠 4 — O pacote GHCR é público
Provado sem qualquer credencial (`~/.docker/config.json` inexistente): token anónimo → manifest
por digest **200**, `tags/list` **200**, `docker pull` bem-sucedido. O repo é privado e a licença
proprietária, mas a imagem construída é descarregável por qualquer pessoa que saiba o caminho.
Não há fuga de credenciais (o único JWT embutido é o **anon**, público por desenho). O que fica
exposto é o **código compilado**. Decisão do Pedro: **tornar privado** → BACKLOG 23.

### 🟠 5 — `DEPLOY.md` descreve um sistema que não existe
NPM, Kong, compose oficial completo, `/opt/tmsiequipment`, `docker compose up --build`, backups
por cron em `/opt/backups`. A produção é: nginx no host, stack magra sem Kong, deploy em
`~/atelier-vps/tmsiequipment`, imagem por digest do GHCR, backup por `tmsi-backup.timer`.
Seguir o documento reconstrói a arquitectura errada. → BACKLOG 21.

### 🟠 6/7/8 — `.env.example` incompleto · vhost não versionado · `smoke.py` não portável
O `.env.example` não chega para montar um `.env` funcional (faltam `API_EXTERNAL_URL`,
`SERVICE_ROLE_KEY`, `PGRST_DB_SCHEMAS`, os `GOTRUE_*`…). O vhost nginx só existe no VPS.
O `smoke.py` tem `BASE` fixo (linha 34) e lê credenciais de `/home/pedro/tmp/tmsi-sudo/`, que não
sobrevivem — não correu contra o drill. → BACKLOG 21.

### 📌 9 — Não há forma de verificar logins pré-existentes depois de um desastre
As passwords `.test` em claro só existem no VPS. O caminho que **funciona** e foi provado é o
**reset administrativo**: com o `SERVICE_ROLE_KEY` novo, `PUT /admin/users/{id}` e depois
`grant_type=password` → token. Utilizadores reais usariam o reset por email, que depende de SMTP
configurado — mais uma variável que vem do `.env` perdido.

## Conclusão

Os dados estão seguros e provaram-no: restauram fielmente, com as protecções todas de pé, num
host diferente e com segredos novos. **O que falta é o kit à volta deles** — o procedimento
escrito, os nomes das variáveis, o vhost, e um caminho para os segredos. Enquanto o `.env` do VPS
só existir no VPS, um desastre real obriga a reconstruir segredos à mão antes de qualquer
restauro começar.
