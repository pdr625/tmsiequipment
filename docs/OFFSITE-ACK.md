# Recibo da cópia off-site (item 55)

**Estado: lado do VPS feito e em produção; falta o lado do homelab (passo abaixo, feito por quem tem acesso ao homelab).**

## O problema
O pull off-site é do homelab (`~/scripts/tmsi-offsite-pull.sh`, dossier `OPERATIONS.md`). O VPS não tem credencial para o homelab, de
propósito, e por isso não sabia se a cópia chegava: o `status.json` só publicava a idade do dump **no VPS**. Se o pull parasse, nada o dizia.

## O desenho (decidido por Pedro, 2026-10-05)
O homelab deixa um **recibo** no VPS no fim de cada pull bem-sucedido. O VPS lê-o e publica o estado.

- **Recibo:** `/home/pedro/backups/tmsi-offsite-ack/last` (pasta `700`, **irmã** de `backups/tmsi`, fora do alcance do `rsync`).
  Uma linha: `<epoch> <nome-do-dump>`, ex.: `1791244800 tmsi-2026-10-06-window.dump`.
- **`status.json`** passa a ter `tmsi_offsite_status` e `tmsi_offsite_ack_age_h`:
  - `ok` — recibo válido com menos de **30 h**;
  - `stale` — recibo válido com 30 h ou mais (o pull parou);
  - `missing` — nunca houve recibo (é o estado de hoje, até o homelab aplicar o passo);
  - `invalid` — formato errado ou data no futuro. **Nunca** devolve `ok` em caso de dúvida.
- O recibo vem de outra máquina, por isso o `vps-stats.sh` trata-o como **dados**: valida por expressão regular estrita
  (`^[0-9]{10} tmsi-[A-Za-z0-9._-]+\.dump$`), só lê a primeira linha e no máximo 200 bytes, nunca o interpreta.

## O passo do homelab (por aplicar)
No `tmsi-offsite-pull.sh`, **depois** do `pg_restore --list` do dump mais recente ter passado (e só então — o recibo significa
«a cópia chegou **e** é legível»), acrescentar:

```bash
# $NEWEST = nome (basename) do dump que acabou de ser verificado, ex. tmsi-2026-10-06-window.dump
ssh vps "umask 077; d=\$HOME/backups/tmsi-offsite-ack; printf '%s %s\n' \"\$(date +%s)\" '$NEWEST' > \$d/last.tmp && mv \$d/last.tmp \$d/last"
```

- A hora (`date +%s`) é tirada **no VPS**, para não depender do relógio do homelab.
- `mv` na mesma pasta: o recibo nunca fica meio escrito.
- Mesma chave `ssh vps` que o pull já usa: **nenhuma credencial nova**.
- Se o recibo falhar a escrever, o script **não** deve dar o pull por falhado (a cópia existe); deve avisar pelo `tg-notify.sh`.
- Ensaio sugerido: correr o script uma vez, ver `cat ~/backups/tmsi-offsite-ack/last` no VPS e, no ciclo seguinte do `vps-stats.timer`
  (≤ 5 min), `tmsi_offsite_status: "ok"` no `status.json`.

## Por fazer a seguir (homelab)
- Tile do `homepage` e alerta do digest para `tmsi_offsite_status != "ok"` (como já existe para `tmsi_backup_age_h`).

## Provas feitas (VPS, 2026-10-05)
Sete ficheiros-recibo sintéticos, resultado = esperado: bom → `ok 3.0 h`; 40 h → `stale`; data no futuro, lixo (`; rm -rf /`),
caminho (`../../etc/passwd`) e vazio → `invalid`; inexistente → `missing`; duas linhas → conta só a primeira.
