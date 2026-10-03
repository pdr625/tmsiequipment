# HANDOVER.md — para a sessão seguinte

Copyright © 2026 Pedro Alexandre. Proprietary — see ../LICENSE.

**Escrito:** 2026-10-03, no fim da sessão «registo das medições, achados do browser, correcções
antes/depois da reunião». **Estado:** a app está estável, sem migração pendente de aplicar. O
bloco grande (migração 0022 + página inicial + protocolo n.º 8) fica para depois da **reunião
com a direcção, 2026-10-13**. A versão anterior deste ficheiro (sessão 0021) está no git
(`git show 3371131:docs/HANDOVER.md`).

---

## 1. Onde isto está

**Produção:** revisão `a5961a7`, digest `sha256:477e01f146cb…`, `healthy`. Migrações **ainda
0001–0021** (nenhuma migração nesta sessão). Smoke **170/170**, verde nos três modos.

| | |
|---|---|
| Pedidos por `/prices` (1 carga) | **8**, medido em produção — fechou o item 85 |
| Reunião com a direcção | **2026-10-13** |
| Dumps | diário 30 dias (purga nova) + semanal 8, os dois sempre activos (item 84) |
| `logrotate` do `tmsi-timing` | corrigido no repo (`kill -USR1` directo); **falta reaplicar no host** — ver §3.1 |

**O que mudou nesta sessão, em três linhas:** três commits pequenos de app (link de login sem
prefetch, Save de `Settings` com feedback, `/products/[id]` com os números formatados); a
política de backup mudou (diário com purga + semanal, sempre os dois); o `logrotate` do
`tmsi-timing` foi corrigido no repo. Nenhuma migração.

---

## 2. Coisas vivas que a sessão seguinte tem de saber

- **O `logrotate` corrigido está no repo mas falta aplicar no host** (precisa de `sudo`, que
  esta sessão não tinha sem TTY). Comandos exactos em `deploy/DEPLOY.md` §0 (bloco do item 87) e
  repetidos no `STATE.md` desta sessão.
- **A purga nova do `tmsi-backup-window` também falta aplicar** (idem, `sudo sed -i` + `systemctl
  enable --now tmsi-backup-weekly.timer`) — comandos no mesmo sítio.
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

### 3.1 — No host, com `sudo` (comandos exactos em `deploy/DEPLOY.md` §0 e §4)

1. Reaplicar o `logrotate` do `tmsi-timing` (item 87) e provar com `logrotate -f` + um pedido
   real — a linha nova tem de cair no ficheiro certo, e `logrotate-postrotate.err` tem de ficar
   vazio.
2. Acrescentar a purga ao `tmsi-backup-window.service` e activar o `tmsi-backup-weekly.timer`
   em permanência (item 84) — os dois têm de aparecer em `systemctl list-timers`.

### 3.2 — No browser, antes da reunião de 2026-10-13

1. **Repetir o ensaio da demonstração** (`DEMO-SCRIPT.md` §0) — mexeu-se em `/config` (Settings),
   em `/products/[id]` (números) e no login; nenhuma delas é o que a demo mostra directamente,
   mas o checklist dos 10 minutos é barato e o próximo evento com a direcção está marcado.
2. Confirmar visualmente o Save de `Settings` («Saved» a verde) e os números do
   `/products/[id]` (duas casas, margem em `%`) — provados por smoke, não vistos ainda no
   browser por ninguém.

---

## 4. Decisões que são tuas — só as novas desta sessão

1. **Item 86 — a 0022 (validação de `settings`) está só esboçada**, não escrita nem ensaiada.
   Antes da reunião, se quiseres antecipar: confirma os limiares exactos (`margin_min <
   margin_target < margin_good`, os intervalos) — estão no item 86 do `BACKLOG.md`, é a base
   que uso para escrever a migração no bloco C.
2. **Item 92** — limiar de alerta por canal vs global, sem prazo.
3. **Itens 93/95** — decisões de dados (cosmético / limpeza do histórico de câmbios de teste),
   sem urgência.

---

## 5. O que NÃO fazer já

- **Migração 0022** — só depois da reunião de 2026-10-13 (bloco C).
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
bloqueou dois diagnósticos/correcções no host (logrotate, backup) que ficaram prontos no repo
mas por aplicar — ver §3.1. Para a sessão que escrever a 0022 (item 86): é migração, corpo de
produção, ensaio em transacção revertida com os valores inválidos de hoje, **mostrar o ficheiro
ao Pedro antes de aplicar**.
