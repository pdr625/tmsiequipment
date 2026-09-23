# CLAUDE.md — convenções deste repositório

Copyright © 2026 Pedro Alexandre. Proprietary — see LICENSE.

Regras de engenharia próprias do `tmsiequipment`. O `~/atelier-vps/CLAUDE.md` (fora do repo)
continua a valer para o VPS — segredos, sudo, backups, metodologia de sessão. Este ficheiro
trata só do que é deste código e deste schema.

Cada regra aqui nasceu de um defeito real, com data e número de item. Não há regras preventivas
inventadas: se está escrita, custou alguma coisa.

---

## Migrações que criam ou recriam funções

**Toda a migração que crie ou recrie funções em `tmsi` termina com `REVOKE` explícito do
`PUBLIC` e com um bloco `DO` que a faz falhar antes do `COMMIT` se sobrar alguma função aberta.**

### Porquê — o mecanismo, medido (item 65, 2026-09-20)

Os privilégios por omissão de uma função nova são o **built-in do PostgreSQL** — que concede
`EXECUTE` a `PUBLIC` e é **global**, não vive em `pg_default_acl` — **mais** o que as entradas de
`pg_default_acl` **acrescentam**. Uma entrada com âmbito de schema **só sabe acrescentar**: não
consegue retirar o que o built-in global concede.

Consequência directa, e contra-intuitiva:

```sql
alter default privileges for role <qualquer> in schema tmsi
  revoke execute on functions from public;     -- NO-OP. Não faz nada.
```

Medido em transacção revertida: uma função criada em `tmsi` pelo `postgres` — o dono que *tem*
entrada por schema — nasce com `=X/postgres postgres=X/postgres authenticated=X/postgres …`.
O `=X/` é o `PUBLIC`. Nasce aberta.

O que funcionaria é um `ALTER DEFAULT PRIVILEGES` **sem** `IN SCHEMA` (global). **Não se faz:**
apanharia as funções que o `supabase_admin` cria noutros schemas (`extensions`, `graphql`,
`realtime`, `public`) e partiria a instância. Decisão do Pedro, 2026-09-20.

### O que pôr no fim da migração

```sql
-- 1. Revogar explicitamente, função a função ou em bloco.
revoke execute on function tmsi.<nome>(<args>) from public;
-- (ou, se a migração mexeu em muitas:)
--   revoke execute on all functions in schema tmsi from public;
--   e a seguir re-conceder a superfície pretendida, uma a uma.

-- 2. A guarda. Levanta excepção ANTES do COMMIT se algo ficou aberto.
do $$
declare v_abertas text;
begin
  select string_agg(p.proname, ', ' order by p.proname) into v_abertas
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'tmsi'
    and (p.proacl is null
         or exists (select 1 from aclexplode(p.proacl) a
                    where a.privilege_type = 'EXECUTE'
                      and (a.grantee = 0 or a.grantee = 'anon'::regrole)));
  if v_abertas is not null then
    raise exception 'Funções de tmsi com EXECUTE a PUBLIC/anon: %', v_abertas;
  end if;
end $$;
```

`aclexplode` com `grantee = 0` (que é o `PUBLIC`) em vez de comparar texto: uma ACL nula significa
*built-in*, ou seja `PUBLIC` — e essa não aparece em nenhuma comparação de strings.

O `scripts/smoke.py` (bloco DD) tem a asserção equivalente, pelo que uma regressão parte também a
suite. A guarda na migração apanha-a mais cedo, quando ainda dá para não comitar.

---

## A superfície RPC é uma lista explícita

Uma função de `tmsi` só tem `EXECUTE` a `authenticated` se for **chamada pela app** ou **usada
numa política RLS**. Está inventariada no cabeçalho da `0016`. Tudo o resto é interno: o motor
chama-as como dono, e ninguém as invoca de fora.

**Antes de conceder `EXECUTE` a uma função nova, procura o chamador.** Um grant sem chamador
conhecido é superfície que ninguém pediu (item 59: `branch_margin`, `override_value` e `fx_rate`
devolviam margem a quem não lê custos, precisamente por estarem abertas sem necessidade).

---

## Guardas de segurança nunca começam por `auth.uid() is not null`

**Isso trata "sem sessão" como "de confiança"** — e foi o item 64: sem credencial nenhuma, o
`compute_price` devolvia o breakdown de custo inteiro de um artigo real, porque as três guardas
dele começavam assim e para o `anon` `auth.uid()` é `NULL`.

O predicado correcto é `tmsi.is_trusted_db_session()` (migração 0017), que ancora no
`session_user`: todo o pedido HTTP entra como `authenticator`, seja `anon`, `authenticated` ou
`service_role`.

**Dentro de uma `SECURITY DEFINER`, `current_role` e `current_user` são o DONO, não quem chamou.**
Qualquer critério baseado neles colapsa para "confiança" e desliga a guarda para toda a gente.

---

## Emular `anon` por psql exige a claim de papel

Um `set role anon` num psql mantém `session_user = postgres`, logo é classificado como **sessão
directa de confiança** — a emulação daria "passou" onde o `anon` real seria negado.

```sql
select set_config('request.jwt.claims', '{"role":"anon"}', true);  -- sem isto, mente
```

Para exercer o caminho verdadeiro, `SET SESSION AUTHORIZATION authenticator` seguido de
`SET ROLE anon` — é o que o `scripts/prova-guarda-anon.sql` faz.

---

## `REVOKE` ao nível da coluna é no-op contra um `GRANT` de tabela

Privilégios de coluna são **aditivos**, nunca restritivos. Para fechar uma coluna: `REVOKE` ao
nível da **tabela** primeiro, depois `GRANT` das colunas seguras.

Documentado na `0003` e **repetido na `0014`**, cujo primeiro rascunho aplicou sem erro e não fez
nada — só se soube ao testar o `GRANT` real, não porque o DDL falhasse.

---

## Vista, app, `REVOKE` — por esta ordem

Ao trocar a leitura de uma tabela por uma vista: criar a vista, **migrar a app**, e só então
`REVOKE` da tabela. A ordem inversa causou uma regressão real em produção (itens 47+48): o ecrã
de produto começou a dar 403 enquanto o código ainda lia a tabela crua.

---

## `CREATE OR REPLACE FUNCTION` não muda a lista de parâmetros

É preciso `DROP` com a assinatura antiga e `CREATE` de novo (`0007`, `0009`, `0015`). Um
parâmetro novo **com default no fim** não afecta chamadores existentes.

---

## Corpos de função vêm de produção, nunca de memória

Ao alterar uma função existente, gerar o corpo com `pg_get_functiondef()` contra a base viva,
aplicar as alterações mínimas, e **mostrar o diff** antes de aplicar. Foi assim que a `0015`
entrou na `0016` e o `compute_price` na `0017` — e é o que garante que a migração reproduz o que
lá está, não o que se julga que lá está.

---

## Uma migração que alarga visibilidade não pode ter a impressão digital igual

A verificação habitual — *md5 de `v_branch_prices` idêntico antes e depois* — **inverte-se**
quando a migração alarga quem vê o quê. As vistas de preço são `security_invoker = true`: a RLS
da `tmsi.products` corre por baixo e decide que artigos chegam sequer à vista. Alargar a
`products_visible` amplia esse conjunto, logo o md5 **tem** de mudar para os papéis alargados.
Se não mudasse, a migração não tinha feito nada.

**A invariante correcta:**

1. Papéis **não** alargados: contagens e md5 **idênticos**.
2. Papéis alargados: as linhas que já viam **continuam lá, com os mesmos valores** — zero
   desaparecidas, zero com valor diferente. As novas são só acréscimo.

Nascido na 0019 (2026-09-20), onde a condição de paragem escrita à partida — "se o md5 mudar,
pára" — teria feito rejeitar uma migração correcta.

---

## "0 = 0" não prova nada

Uma asserção que compara zero com zero passa por razões erradas: papel sem linhas, alvo mal
escolhido, filtro que já excluía tudo. **Antes de afirmar que uma fronteira funciona, garantir
que existe alguma coisa do outro lado** — activar fixtures, escolher um alvo dentro do âmbito do
papel, e medir cada papel no seu próprio âmbito.

Erro cometido em `prova-guarda-anon.sql` (2026-09-20): o `sales` da filial SA era interrogado
sobre a TBM, dava 0 linhas, e isso não dizia nada sobre a guarda.

---

## Antes de escrever um ficheiro, olhar para o que lá está — e a guarda que o verifica

`cat > ficheiro` e `Write` **substituem**. Um ficheiro de documentação que se julga novo pode ter
cem linhas de levantamento que ninguém vai dar por falta durante semanas.

Aconteceu a 2026-09-23 com `docs/TEST-ACCOUNTS.md`: escrito de raiz a assumir que não existia,
105 linhas apagadas num commit. **A regra de olhar primeiro já existia neste ficheiro e não
chegou** — uma regra que depende de alguém se lembrar dela falha exactamente no momento em que se
está concentrado noutra coisa.

**A verificação mecânica:** `scripts/hooks/commit-msg`, activo por
`git config core.hooksPath scripts/hooks`, recusa um commit que faça um ficheiro de `docs/` perder
mais de **50%** das linhas, a menos que a mensagem traga a palavra `rewrite`. O bloco `GG` do
smoke confirma que está instalado **e que de facto recusa** — exercita-o num repositório
descartável, porque um hook presente mas partido passaria numa asserção que só verificasse a sua
existência.

Uma redução legítima escreve `rewrite` na mensagem e explica porquê; fica no histórico a dizê-lo.

---

## Provas: contagens e identificadores, nunca valores

Nada de preços, custos ou margens reais em output, logs, relatórios ou commits. Para comparar
sem expor, **impressão digital**: `md5(string_agg(...))` sobre as colunas em causa — prova que
nada mudou sem revelar o que é.

Ficheiros com dados reais vivem fora do repo (`~/tmp/…`, `700`/`600`) e nunca entram no git.
Incidente de 2026-09-16: uma linha de catálogo inteira impressa no output de uma sessão por um
`awk` que só queria contar campos.

---

## Escrita em dados reais

Transacção única · autoria real (nunca `null`) · **desfazer preparado e provado antes** · e
impressão digital dos preços antes/depois a provar que nada mais se mexeu.

O desfazer prova-se primeiro num artigo fictício **que já tenha valor no campo** — repor um campo
vazio não exercita o caso difícil (item 58).
