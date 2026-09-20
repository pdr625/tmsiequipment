#!/bin/bash
# exposicao-rest.sh — quem tocou na API REST do TMSI, segundo o nginx.
#
# Passo do docs/VERIFICATION-PROTOCOL.md, a correr DEPOIS DE QUALQUER ACHADO DE
# FRONTEIRA: descobrir uma porta aberta é metade; a outra metade é saber se
# alguém lá entrou enquanto esteve aberta. Itens 59 e 64.
#
# SÓ LEITURA. Não escreve nada, não toca em serviços, não imprime corpos de
# pedido nem cabeçalhos — só IP, dia, caminho e código de resposta.
#
# PRECISA DE SUDO: /var/log/nginx é root:adm 0640 e o utilizador `pedro` não
# pertence ao grupo `adm`.
#
#   IPS_CONHECIDOS="1.2.3.4 5.6.7.8" sudo -E scripts/exposicao-rest.sh
#   sudo scripts/exposicao-rest.sh 1.2.3.4 5.6.7.8
#
# Os IPs conhecidos (os do Pedro, o do próprio VPS, o do container da app)
# entram por ambiente ou argumento — NUNCA escritos neste ficheiro, que vai
# para o git.
#
# ---------------------------------------------------------------------------
# O QUE ESTE SCRIPT CORRIGE (os dois defeitos da primeira versão, 2026-09-20)
# ---------------------------------------------------------------------------
# 1. A agregação por função/dia fazia `grep -o` de caminhos e de datas em TODAS
#    as linhas e depois emparelhava-os com `paste - -`. As duas listas não têm
#    o mesmo comprimento (uma linha tem sempre data, mas só algumas têm
#    /rpc/), logo os pares saíam DESALINHADOS: datas de umas linhas coladas a
#    caminhos de outras. Aqui os campos saem todos da MESMA linha, por `awk`.
# 2. Não mostrava o código de resposta — e é ele que separa uma porta batida
#    (401/403) de uma fuga servida (200). Sem o status, "houve pedidos" não
#    diz nada.
#
# Formato combined do nginx: $1 remote_addr · $4 [dd/Mmm/aaaa:hh:mm:ss ·
# $7 caminho · $9 status.

set -uo pipefail

IPS_CONHECIDOS="${IPS_CONHECIDOS:-}"
[ $# -gt 0 ] && IPS_CONHECIDOS="$IPS_CONHECIDOS $*"

LOGS=/var/log/nginx/access.log

if [ ! -r "$LOGS" ]; then
  echo "ERRO: $LOGS não é legível. Correr com sudo." >&2
  exit 1
fi

echo "============================================================"
echo " 0. A FONTE — há mais do que um access_log?"
echo "============================================================"
echo "Directivas access_log activas (vhosts + nginx.conf):"
grep -rhE "^\s*access_log" /etc/nginx/sites-enabled/ /etc/nginx/nginx.conf 2>/dev/null \
  | sed 's/^\s*/  /' | sort -u
echo
echo "Uma só linha aqui = log partilhado por todas as apps do VPS, e é a única"
echo "fonte forense. Se aparecer um access_log próprio de um vhost, este script"
echo "está a olhar para o sítio errado."
echo
echo "Retenção disponível:"
ls -1 /var/log/nginx/access.log* 2>/dev/null | wc -l | sed 's/^/  ficheiros: /'
echo -n "  mais antigo: "
ls -lt /var/log/nginx/access.log* 2>/dev/null | tail -1 | awk '{print $6, $7, $8, $9}'
echo "  (logrotate: $(grep -oP 'rotate\s+\K[0-9]+' /etc/logrotate.d/nginx 2>/dev/null | head -1) dias)"
echo

echo "============================================================"
echo " 1. TUDO o que pediu /rest/v1/  —  IP · dia · caminho · status"
echo "============================================================"
zcat -f /var/log/nginx/access.log* 2>/dev/null \
  | awk '$7 ~ /^\/rest\/v1\// {
      split($7, p, "?");                       # fora a query string
      print $1, substr($4, 2, 11), p[1], $9
    }' \
  | sort | uniq -c | sort -rn
echo

echo "============================================================"
echo " 2. O MESMO, excluindo IPs conhecidos  —  vazio = ninguém de fora"
echo "============================================================"
if [ -z "${IPS_CONHECIDOS// /}" ]; then
  echo "  (IPS_CONHECIDOS vazio — esta secção não filtra nada. Passa os IPs"
  echo "   do VPS, do container da app e os teus, por ambiente ou argumento.)"
  echo
fi
zcat -f /var/log/nginx/access.log* 2>/dev/null \
  | awk -v conhecidos="$IPS_CONHECIDOS" '
      BEGIN { n = split(conhecidos, k, /[ ,]+/); for (i = 1; i <= n; i++) if (k[i] != "") ign[k[i]] = 1 }
      $7 ~ /^\/rest\/v1\// && !($1 in ign) {
        split($7, p, "?"); print $1, substr($4, 2, 11), p[1], $9
      }' \
  | sort | uniq -c | sort -rn
echo "  ^ se não apareceu nada acima desta linha: zero pedidos de terceiros."
echo

echo "============================================================"
echo " 3. VALIDAÇÃO DO MÉTODO — top 15 de IPs em TODO o access.log"
echo "============================================================"
echo "Se aqui só aparecerem IPs internos, o nginx não está a registar a origem"
echo "real (proxy/NAT à frente) e a secção 2 não prova nada. Tem de haver IPs"
echo "externos reais nesta lista para a ausência na secção 2 ser medição."
echo
zcat -f /var/log/nginx/access.log* 2>/dev/null \
  | awk '{print $1}' | sort | uniq -c | sort -rn | head -15
echo

echo "============================================================"
echo " LIMITE DA PROVA — escrever isto ao lado de qualquer conclusão"
echo "============================================================"
cat <<'FIM'
  · Só vale para o que o access_log do nginx regista, e só dentro da retenção
    do logrotate (hoje 14 dias — item 66).
  · O PostgREST NÃO é fonte alternativa: PGRST_LOG_LEVEL está por omissão
    (`error`), logo pedidos bem sucedidos não deixam rasto nenhum.
  · Um pedido servido a partir de cache, ou por um caminho que não passe pelo
    nginx, não aparece aqui. Neste VPS não há nenhum — mas é premissa, não
    medição.
FIM
