#!/bin/bash
# contar-pedidos.sh — quantos pedidos ao backend gera um carregamento de página.
#
# A prova da correcção do item 73 não é o tempo (depende da carga do host, e a
# regra do ~/atelier-vps/CLAUDE.md diz que números tirados com uma sessão de
# agente aberta não valem) — é a CONTAGEM, que é determinística.
#
#   scripts/contar-pedidos.sh            # os últimos 2 minutos
#   scripts/contar-pedidos.sh 5          # os últimos 5 minutos
#
# Só leitura. Não imprime valores de catálogo — só método, caminho e contagem.

set -uo pipefail
MIN="${1:-2}"
DESDE="$(date -d "$MIN minutes ago" -Iseconds | cut -c1-19)"
LOG=/var/log/tmsi/tmsi-timing.log
BROWSER_EXCLUI='172.20.40.5'

echo "=== desde $DESDE (últimos $MIN min) ==="
echo
echo "--- páginas servidas ao browser ---"
awk -v d="$DESDE" '$1 >= d && $2 != "'"$BROWSER_EXCLUI"'"' "$LOG" |
  grep -oE '"(GET|POST) [^ ]+' | sed 's/"//' | sort | uniq -c | sort -rn | head -12
echo
echo "--- pedidos da app ao PostgREST/GoTrue, por destino ---"
awk -v d="$DESDE" '$1 >= d && $2 == "'"$BROWSER_EXCLUI"'"' "$LOG" |
  grep -oE '"(GET|POST) /[^? ]+' | sed 's/"//' | sort | uniq -c | sort -rn
echo
TOTAL=$(awk -v d="$DESDE" '$1 >= d && $2 == "'"$BROWSER_EXCLUI"'"' "$LOG" | wc -l)
PAG=$(awk -v d="$DESDE" '$1 >= d && $2 != "'"$BROWSER_EXCLUI"'"' "$LOG" | grep -cE '"GET /prices' || true)
PREF=$(awk -v d="$DESDE" '$1 >= d && $2 != "'"$BROWSER_EXCLUI"'"' "$LOG" | grep -c '_rsc=' || true)
echo "TOTAL de pedidos ao backend: $TOTAL"
echo "carregamentos de /prices:    $PAG"
echo "pré-carregamentos (_rsc):    $PREF   <- tem de ser 0"
[ "$PAG" -gt 0 ] && echo "média por carregamento:      $((TOTAL / PAG))   <- eram 8, devem ser 6"
