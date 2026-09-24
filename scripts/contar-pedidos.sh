#!/bin/bash
# contar-pedidos.sh — quantos pedidos ao backend custa uma página.
#
# A prova da correcção do item 73 não é o tempo: depende da carga do host, e a
# regra do ~/atelier-vps/CLAUDE.md diz que números de desempenho tirados com
# uma sessão de agente aberta não valem. É a CONTAGEM, que é determinística.
#
#   scripts/contar-pedidos.sh        # últimos 5 minutos
#   scripts/contar-pedidos.sh 15     # últimos 15
#
# Só leitura. Nunca imprime valores de catálogo — só método, caminho e contagem.
#
# ---------------------------------------------------------------------------
# NAVEGAÇÃO NÃO É PREFETCH (2026-09-24)
# ---------------------------------------------------------------------------
# Um pedido com `?_rsc=` é de React Server Component, e pode ser duas coisas
# com o mesmo custo e o mesmo caminho:
#
#   NAVEGAÇÃO  o utilizador clicou num <Link>. Trabalho pedido. LEGÍTIMO.
#   PREFETCH   o Next.js foi buscá-lo sozinho. Trabalho especulativo.
#
# Só os cabeçalhos os separam — `Next-Router-Prefetch: 1` (ou `Purpose:
# prefetch`) está no segundo e não no primeiro. Por isso o `log_format
# tmsi_timing` passou a registá-los. **Um log anterior a essa alteração não
# tem os campos**, e este script diz-o em vez de fingir que sabe.
#
# ⚠️ `prefetch={false}` no <Link> do App Router **não desliga o prefetch** —
# desliga o automático por viewport, mas o Next.js continua a pré-carregar ao
# passar o rato. É precisamente isso que estes campos tornam visível.

set -uo pipefail

MIN="${1:-5}"
LOG=/var/log/tmsi/tmsi-timing.log
APP_IP='172.20.40.5'          # o contentor tmsi-app a falar com PostgREST/GoTrue
DESDE="$(date -d "$MIN minutes ago" -Iseconds | cut -c1-19)"

[ -r "$LOG" ] || { echo "sem acesso a $LOG" >&2; exit 1; }

JANELA="$(awk -v d="$DESDE" '$1 >= d' "$LOG")"
[ -n "$JANELA" ] && echo "=== últimos $MIN min (desde $DESDE) ===" || {
  echo "nada registado nos últimos $MIN min."; exit 0; }

# Os campos novos existem nesta janela? Um log de antes de 2026-09-24 não os tem.
TEM_CABECALHOS=0
printf '%s\n' "$JANELA" | grep -q 'pf=' && TEM_CABECALHOS=1

classificar() {
  # devolve: PAGINA | NAVEGACAO | PREFETCH | OUTRO
  awk -v app="$APP_IP" '
    $2 == app { next }                                  # pedido da app, não do browser
    {
      linha = $0
      pedido = ""
      if (match(linha, /"[A-Z]+ [^"]+"/)) pedido = substr(linha, RSTART, RLENGTH)
      prefetch = (linha ~ /pf=1/ || linha ~ /purpose=prefetch/)
      rsc = (pedido ~ /_rsc=/)
      if (!rsc)          tipo = "PAGINA"
      else if (prefetch) tipo = "PREFETCH"
      else               tipo = "NAVEGACAO"
      print tipo
    }' <<< "$JANELA"
}

echo
echo "--- o que o browser pediu ---"
if [ "$TEM_CABECALHOS" = "1" ]; then
  classificar | sort | uniq -c | sed 's/^/  /'
else
  echo "  ⚠️ esta janela do log é ANTERIOR aos campos de cabeçalho (2026-09-24)."
  echo "     Um ?_rsc= aqui pode ser navegação OU prefetch — não há como saber."
  printf '%s\n' "$JANELA" | awk -v app="$APP_IP" '$2 != app' \
    | grep -c '_rsc=' | sed 's/^/  pedidos _rsc (indistintos): /'
fi

echo
echo "--- pedidos da app ao PostgREST/GoTrue, por destino ---"
printf '%s\n' "$JANELA" | awk -v app="$APP_IP" '$2 == app' \
  | grep -oE '"(GET|POST) /[^? ]+' | sed 's/"//' | sort | uniq -c | sort -rn | sed 's/^/  /'

# --- a métrica que interessa: pedidos por CARREGAMENTO COMPLETO -------------
# Um carregamento completo é uma página HTML (sem ?_rsc=), não uma navegação
# client-side: só esse paga o custo inteiro — middleware, layout e página.
# Misturar os dois dilui a média e esconde a regressão que se quer vigiar.
TOTAL_BACKEND=$(printf '%s\n' "$JANELA" | awk -v app="$APP_IP" '$2 == app' | wc -l)
COMPLETOS=$(printf '%s\n' "$JANELA" | awk -v app="$APP_IP" '$2 != app' \
  | grep -E '"GET /(prices|products|dashboard|config|overrides|proposals|audit|branches|import)' \
  | grep -vc '_rsc=' || true)

echo
echo "--- a métrica ---"
printf '  pedidos ao backend na janela: %s\n' "$TOTAL_BACKEND"
printf '  carregamentos COMPLETOS:      %s\n' "$COMPLETOS"
if [ "$TEM_CABECALHOS" = "1" ]; then
  NAV=$(classificar | grep -c NAVEGACAO || true)
  PRE=$(classificar | grep -c PREFETCH || true)
  printf '  navegações client-side:       %s   (legítimas — houve clique)\n' "$NAV"
  printf '  PREFETCH:                     %s   <- o que se quer a zero\n' "$PRE"
fi
if [ "${COMPLETOS:-0}" -gt 0 ]; then
  echo
  echo "  ⚠️ a média abaixo divide TODOS os pedidos ao backend pelos carregamentos"
  echo "     completos — se houve navegações ou prefetch na janela, ela inflaciona."
  echo "     Para a medida limpa: uma janela com UM carregamento e mais nada."
  printf '  média por carregamento:       %s   (eram 8; o objectivo é 6 ou menos)\n' \
    "$((TOTAL_BACKEND / COMPLETOS))"
else
  echo "  (sem carregamentos completos na janela — a média não é calculável)"
fi
