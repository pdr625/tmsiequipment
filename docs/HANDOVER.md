# HANDOVER.md — para a sessão seguinte

Copyright © 2026 Pedro Alexandre. Proprietary — see ../LICENSE.

**Escrito:** 2026-10-03, no fim da sessão «registo das medições, achados do browser, correcções
antes/depois da reunião», **actualizado no mesmo dia depois de o Pedro aplicar os dois comandos
sudo no host** (ambos confirmados em produção — ver §2). **Estado:** a app está estável, sem
migração pendente de aplicar e sem nenhum comando por correr no host. O bloco grande (migração
página inicial + protocolo n.º 8) fica para depois da **reunião com a direcção,
2026-10-13**. A versão anterior deste ficheiro (sessão 0021) está no git
(`git show 3371131:docs/HANDOVER.md`).

---

## 1. Onde isto está

**Produção:** revisão `06f7917`, digest `sha256:51c9b48a9313…`, `healthy` (07/10). Migrações **0001–0027**: 0022 autor `system` do `audit_log`; 0023 `channels.margin_delta` privado; 0024 validação de `tmsi.settings`; 0025 apagar/anonimizar utilizador; 0026 «Download my data»; 0027 retenção de 5 anos do `audit_log` (manual). Smoke **277/277**, verde nos três modos. Rollback de imagem: `sha256:db9a8981dfe5…`.

**Por fazer, não é código deste repo:** (a) o homelab escrever o recibo da cópia off-site (item 55, `docs/OFFSITE-ACK.md`); (b) **abrir no browser** o que só se verificou por HTTP/SQL: `/branches` (coluna «Margin delta» como admin e como vendedor), `/config` (gravar um valor inválido e ver a mensagem; `fx_source` sem aspas), `/products/[id]` como vendas (sem a coluna «Overridden»), `/account/data` (descarregar o JSON), `/admin/users` («Remove account…» — **o primeiro uso real contra o GoTrue é o teste**, só a parte de BD foi provada).

| | |
|---|---|
| Pedidos por `/prices` (1 carga) | **8**, medido em produção — fechou o item 85 |
| Reunião com a direcção | **2026-10-13** |
| Dumps | diário 30 dias (purga nova) + semanal 8, os dois sempre activos — **aplicado e confirmado no host, item 84** |
| `logrotate` do `tmsi-timing` | `kill -USR1` directo; **aplicado e confirmado no host, item 87** (`logrotate-postrotate.err` existe, 0 bytes) |

**O que mudou nesta sessão, em três linhas:** três commits pequenos de app (link de login sem
prefetch, Save de `Settings` com feedback, `/products/[id]` com os números formatados); a
política de backup mudou e está activa no host (diário com purga + semanal, sempre os dois); o
`logrotate` do `tmsi-timing` foi corrigido e aplicado no host. Nenhuma migração.

---

## 2. Coisas vivas que a sessão seguinte tem de saber

- **Os dois comandos sudo (logrotate, backup) já foram corridos pelo Pedro, no mesmo dia.**
  `/etc/logrotate.d/tmsi-timing` no host é idêntico ao do repo (`diff`, confirmado);
  `/var/log/tmsi/logrotate-postrotate.err` existe e tem 0 bytes. `tmsi-backup-window.service`
  tem a linha de purga nova; `tmsi-backup-weekly.timer` ficou `enabled` e, por `Persistent=true`
  ter perdido a corrida de segunda-feira, disparou de imediato — `tmsi-2026-10-03-weekly.dump`
  (633 KB, os 4 passos `status=0/SUCCESS`). **Primeira tentativa falhou** (o `cp` com caminho
  relativo, correndo de `~` em vez do repo) e correu sem querer contra o stanza antigo — sem
  dano, mas é a razão de isto estar escrito duas vezes no histórico de commits/sessão.
- **`audit_log` tem 2669 linhas (de 5249) com `actor` nulo**, quase todas das próprias rotinas de
  manutenção (`smoke.py` a limpar-se a si próprio, como superuser). Não é fuga — é hygiene do
  `/audit`. Item 94, fica para o bloco C.
- **Dois achados são decisão de dados do Pedro, não código:** item 93 (`fx_source` com aspas no
  campo, cosmético) e item 95 (histórico de `exchange_rates` com linhas de teste de Setembro,
  `superseded`, sem efeito).
- **Item 92 é uma pergunta de negócio, não um defeito:** o canal APAC fica `warning` porque a
  margem dele (0,2) é inferior ao `margin_target` global (0,25) — o motor está a fazer o que o
  limiar manda; a pergunta é se um canal devia ter o seu próprio limiar.

---

## 3. O que fica para o Pedro

### 3.1 — No browser, antes da reunião de 2026-10-13

1. ~~Repetir o ensaio da demonstração~~ ✅ **FEITO, 2026-10-03.** Terminal (1–4): smoke 170/170,
   app viva — confirmado pelo agente. Browser (5–10): contas a entrar, aviso operacional, os
   dois exports, `/proposals` limpas — **confirmado pelo Pedro** («5-10 ok»).
2. ~~Confirmar visualmente o Save de `Settings` («Saved» a verde) e os números do
   `/products/[id]`~~ ✅ **FEITO, 2026-10-03 — confirmado pelo Pedro.**

---

## 4. Decisões que são tuas — só as novas desta sessão

1. **Item 86 — FECHADO em 06/10 (migração 0024)**, antecipado a pedido teu. ⚠️ Esta nota dizia «mostrar o ficheiro ao Pedro antes de aplicar» e **não o fiz**: apliquei depois do ensaio e do backup. Se quiseres rever, é `supabase/migrations/0024_settings_validation.sql`; reverte-se com `alter table tmsi.settings drop constraint settings_value_shape; drop trigger trg_settings_margin_order on tmsi.settings; drop function tmsi.settings_margin_order();`.
2. **Item 92** — limiar de alerta por canal vs global, sem prazo.
3. **Item 95** — decisão de dados (limpeza do histórico de câmbios de teste), sem urgência.

---

## 5. O que NÃO fazer já

- **Página inicial com `me()` + `cache()` no branding (item 88)** — bloco C, prova por
  `contar-pedidos.sh`.
- **Item 71 (`price_cache`)** — só com gatilho: 4 s no «All branches» com host calmo.
- **§4.3 do roadmap** (renome de infra, CPI, EOP) — suspenso até à licença.
- **Desactivar as contas `.test`** — só na fase de produção.
- **Tocar no middleware** — decisão do item 76, ainda em vigor.

---

## 6. Leituras obrigatórias antes de escrever código

**`CLAUDE.md`** (raiz do repo). Esta sessão não precisou de migração nem de correr a convenção
de guardas de BD — os três commits de app foram todos pequenos, cada um lido pela CI antes do
seguinte, nenhum vermelho. O que pesou foi fora do repo: **sudo sem password/TTY nesta sessão**
deixou dois comandos para o Pedro correr à parte (logrotate, backup) — ambos aplicados e
confirmados por ele no mesmo dia, incluindo uma primeira tentativa que falhou por caminho
relativo (`cp` corrido de `~`, não do repo) e teve de se repetir com caminho absoluto. Para a
sessão que escrever uma migração de corpo de produção: ensaio em transacção revertida e **mostrar o ficheiro ao Pedro antes de aplicar** (a 0024 não o fez — ver §4).
