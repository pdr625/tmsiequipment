#!/bin/bash
# ci-log.sh — o que a CI disse, sem ir ao browser.
#
# Dado um sha (ou nada, e usa o HEAD), diz qual o passo que falhou e imprime as
# linhas que interessam: `Type error`, `Failed to compile`, `error TS####`.
#
# PORQUE EXISTE. A 2026-09-23 três revisões seguidas falharam no `npm run
# build` e esta sessão não conseguiu saber porquê: não há `gh` no VPS, o PAT
# local só tem `read:packages`, e não há Node aqui para compilar (961 MB de
# RAM — construir causa OOM, regra dos recursos do ~/atelier-vps/CLAUDE.md).
# Foram três palpites e três ciclos de CI desperdiçados, quando o log tinha a
# resposta desde o primeiro minuto. Esta é a ferramenta que faltava.
#
# ---------------------------------------------------------------------------
# O TOKEN
# ---------------------------------------------------------------------------
# PAT **fine-grained**, só para `pdr625/tmsiequipment`, com uma única permissão:
#   Repository permissions -> Actions: Read-only
# Nada mais. Não precisa de `contents`, não precisa de `packages` — é outro
# token, com outro âmbito, e de propósito: o do GHCR faz `pull`, este lê logs.
#
#   ficheiro: ~/tmp/tmsi-sudo/github-actions-read.txt
#   modo:     600, sem newline final
#   criar:    read -rsp 'PAT: ' P && printf '%s' "$P" > ~/tmp/tmsi-sudo/github-actions-read.txt && unset P
#             chmod 600 ~/tmp/tmsi-sudo/github-actions-read.txt
#
# Inspeccionar esse ficheiro: **só `wc -c`, `wc -l` e `stat`** — nunca `cat`,
# `head`, `tail`, `od`, nem parciais (regra do ~/atelier-vps/CLAUDE.md, três
# recidivas). Este script lê-o com `$(cat …)` DENTRO do comando que o consome,
# que é o padrão autorizado.
#
# ESCROW: o token entra no `tmsi-secrets-<data>.gpg` junto do `.env` e do PAT
# do GHCR (DEPLOY.md §6) — **e o escrow é re-cifrado quando este token nascer
# ou rodar**, como já é regra para o `.env`. Sem isso, uma recuperação de raiz
# fica outra vez sem forma de ler a CI.
#
# ---------------------------------------------------------------------------
# USO
# ---------------------------------------------------------------------------
#   scripts/ci-log.sh                 # o HEAD actual
#   scripts/ci-log.sh 21bfa2f         # um sha curto ou completo
#   scripts/ci-log.sh 21bfa2f --tudo  # o log inteiro do passo que falhou
#
# Não imprime o token, nem o cabeçalho de autorização, em caso nenhum.

set -uo pipefail

REPO="pdr625/tmsiequipment"
TOKEN_FILE="${TMSI_ACTIONS_TOKEN_FILE:-$HOME/tmp/tmsi-sudo/github-actions-read.txt}"
API="https://api.github.com/repos/$REPO"

SHA="${1:-}"
TUDO="${2:-}"
[ "${SHA}" = "--tudo" ] && { TUDO="--tudo"; SHA=""; }
[ -z "$SHA" ] && SHA="$(git rev-parse HEAD 2>/dev/null)"
[ -z "$SHA" ] && { echo "uso: $0 <sha> [--tudo]" >&2; exit 2; }

if [ ! -r "$TOKEN_FILE" ]; then
  cat >&2 <<FIM
ERRO: não encontro o token em $TOKEN_FILE

  PAT fine-grained, só para $REPO, permissão Actions: Read-only.
  read -rsp 'PAT: ' P && printf '%s' "\$P" > $TOKEN_FILE && unset P
  chmod 600 $TOKEN_FILE

  (e acrescenta-o ao escrow — DEPLOY.md §6)
FIM
  exit 1
fi

api() {
  # O token entra aqui e só aqui, dentro do comando que o consome.
  curl -fsSL \
    -H "Authorization: Bearer $(cat "$TOKEN_FILE")" \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "$@"
}

# O sha pode vir curto; a API quer o completo.
SHA_LONGO="$(git rev-parse "$SHA" 2>/dev/null || echo "$SHA")"

echo "=== execuções para ${SHA_LONGO:0:7} ==="
RUNS="$(api "$API/actions/runs?head_sha=$SHA_LONGO&per_page=5")" || {
  echo "ERRO: a API recusou. Token sem permissão Actions:read, expirado, ou repo errado." >&2
  exit 1
}

N="$(printf '%s' "$RUNS" | python3 -c 'import json,sys; print(json.load(sys.stdin)["total_count"])')"
if [ "$N" = "0" ]; then
  echo "  nenhuma — a CI não disparou para este sha."
  echo "  (o workflow só corre em paths: app/** — um commit só de docs não dispara, e isso é normal)"
  exit 0
fi

# O código vem por stdin e o JSON por argumento: dentro de python3 -c '...' as
# aspas escapadas não sobrevivem ao shell, e a API devolve `workflow_runs`,
# não `runs` (as duas coisas partiram a primeira versão, 2026-09-24).
python3 - "$RUNS" <<'PY'
import json, sys
d = json.loads(sys.argv[1])
for r in d["workflow_runs"]:
    fim = r.get("conclusion") or "—"
    print(f'  #{r["run_number"]}  {r["status"]}/{fim}  {r["created_at"]}  id={r["id"]}')
PY

RUN_ID="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["workflow_runs"][0]["id"])' "$RUNS")"
CONCLUSAO="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["workflow_runs"][0].get("conclusion") or "em curso")' "$RUNS")"

echo
echo "=== passos da execução mais recente (conclusão: $CONCLUSAO) ==="
JOBS="$(api "$API/actions/runs/$RUN_ID/jobs")" || exit 1
python3 - "$JOBS" <<'PY'
import json, sys
d = json.loads(sys.argv[1])
for j in d["jobs"]:
    print(f'  job {j["name"]}: {j["status"]}/{j.get("conclusion") or "—"}')
    for p in j.get("steps", []):
        marca = "✘" if p.get("conclusion") == "failure" else " "
        estado = p.get("conclusion") or p["status"]
        print(f'    {marca} {p["number"]:>2}. {p["name"]}  [{estado}]')
PY

JOB_ID="$(python3 - "$JOBS" <<'PY'
import json, sys
d = json.loads(sys.argv[1])
falhados = [j for j in d["jobs"] if j.get("conclusion") == "failure"]
print(falhados[0]["id"] if falhados else (d["jobs"][0]["id"] if d["jobs"] else ""))
PY
)"
[ -z "$JOB_ID" ] && { echo "sem job para ler."; exit 0; }

echo
LOG="$(api "$API/actions/jobs/$JOB_ID/logs")" || {
  echo "ERRO: não consegui obter o log do job $JOB_ID." >&2; exit 1; }

if [ "$TUDO" = "--tudo" ]; then
  echo "=== log completo do job $JOB_ID ==="
  printf '%s\n' "$LOG"
  exit 0
fi

# Numa execução VERDE não há erro para procurar, e varrer o log à mesma dá
# falsos positivos — o dump do contexto do GitHub traz a palavra "error" em
# campos que nada têm a ver com a compilação (apanhado a 2026-09-24, na
# primeira utilização real desta ferramenta).
if [ "$CONCLUSAO" = "success" ]; then
  echo "=== execução VERDE — nada a reportar ==="
  echo "  (para o log completo: $0 ${SHA:0:7} --tudo)"
  exit 0
fi

echo "=== o que interessa ==="
# As linhas do erro PRIMEIRO, sem contexto: são a resposta, e é isso que se
# quer ver no topo. A primeira versão desta secção punha 12 linhas de contexto
# antes de cada correspondência, o ruído do tsconfig enchia o ecrã e o `head`
# cortava antes da linha do erro — que era exactamente o que se procurava
# (apanhado a 2026-09-24, na primeira utilização real).
ACHOU=0
ERROS="$(printf '%s\n' "$LOG" | grep -oE "[^ ]+\([0-9]+,[0-9]+\): error TS[0-9]+: .*|Type error: .*" | sort -u)"
if [ -n "$ERROS" ]; then
  ACHOU=1
  printf '%s\n' "$ERROS" | sed 's/^/  ✘ /'
fi

# E depois o enquadramento: onde é que o build desistiu.
RESUMO="$(printf '%s\n' "$LOG" | grep -E "Failed to compile|Failed to type check|npm ERR!|ERROR: failed to build" | head -6)"
if [ -n "$RESUMO" ]; then
  ACHOU=1
  echo
  printf '%s\n' "$RESUMO" | sed -E 's/^[0-9T:.Z-]+ //; s/^/  /'
fi

if [ "$ACHOU" = "0" ]; then
  echo "  (nenhum erro de tipos no log — o passo falhou por outra razão)"
  echo
  echo "=== últimas 40 linhas do job ==="
  printf '%s\n' "$LOG" | tail -40
  echo
  echo "  para o log inteiro: $0 ${SHA:0:7} --tudo"
fi
