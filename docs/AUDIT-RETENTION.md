# Retenção do audit_log (item 49)

Copyright © 2026 Pedro Alexandre. Proprietary — see ../LICENSE.

O prazo decidido é **5 anos** a partir da data de cada entrada (`DATA-PROCESSING-NOTICE.md` §1). O mecanismo é **manual**.
A entrada mais antiga é de **2026-09-03**: nada é elegível antes de **2031-09-03**.

## Ver se há alguma coisa para purgar
O `status.json` do VPS publica `tmsi_audit_oldest_age_d` (idade, em dias, da entrada mais antiga) e `tmsi_audit_eligible` (quantas já passaram o prazo). Enquanto `tmsi_audit_eligible` for 0, não há nada a fazer.

## Purgar (só quando `tmsi_audit_eligible` > 0)
1. **Backup verificado** antes (`pg_dump -Fc` + `pg_restore -l`), como em qualquer alteração destrutiva do projecto.
2. **Simular** — só conta, não apaga:
   ```
   docker exec -i supabase-db psql -U postgres -d postgres <<'SQL'
   select set_config('request.jwt.claims', '{"sub":"<UUID DE UM ADMIN>","role":"authenticated"}', false);
   set role authenticated;
   select tmsi.purge_audit_log();
   SQL
   ```
   Devolve `{"dry_run": true, "eligible": N, "oldest_eligible": ..., "cutoff": ..., "deleted": 0}`.
3. **Apagar** — o mesmo com `tmsi.purge_audit_log(false)`. Fica uma linha em `tmsi.audit_purges`.

## Garantias (vigiadas no smoke, bloco `AC`)
- Só `admin`; por omissão só simula.
- O prazo está dentro da função: **não há parâmetro de data** e uma sobrecarga com data faz o smoke falhar.
- Apaga exactamente o que tem mais de 5 anos (provado com linhas sintéticas de cada lado da fronteira) e mais nada.
- Cada purga real deixa rasto em `tmsi.audit_purges`, que a própria purga não toca.
- Não há arquivo frio: o que se apaga não se recupera, a não ser por um dump anterior (retenção de 30 dias).
