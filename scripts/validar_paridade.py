#!/usr/bin/env python3
# TMSI Equipment Price Listing
# Copyright (c) 2026 Pedro Alexandre. All rights reserved.
# PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
# distribution is strictly prohibited. See LICENSE at the repository root.
#
# Validador do CSV de paridade motor-vs-Excel (ver PREENCHIMENTO.md ao lado).
# python3 stdlib only — sem pip, sem node. Read-only sobre a BD: só confirma,
# via GET a PostgREST, que filiais/canais/moedas/códigos HS existem e se há
# escalões/overrides que o ficheiro devia estar a testar — nunca escreve nada.
#
# v2 (docs/MODEL-GAP-ANALYSIS.md, sessão de reconciliação com o Excel real):
# troca a única coluna excel_price por 8 colunas espelhando a cadeia do
# Excel, acrescenta colunas de override por artigo, e passa a aceitar linhas
# de CANAL (branch_id pode ser um canal, ex. APAC, não só uma filial) — nessas
# linhas fee/direitos ficam por preencher por desenho, o motor ainda não os
# calcula (achado #5/#6 do MODEL-GAP-ANALYSIS.md).
#
# Password rule (~/atelier-vps/CLAUDE.md, "TMSI — passwords de teste"), mesmo
# padrão do scripts/smoke.py: a credencial é lida com open(path).read().strip()
# directo para uma variável que só entra no corpo do pedido HTTP — nunca
# impressa, nunca em argv.

import csv
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import date

BASE = os.environ.get("TMSI_BASE_URL", "https://tmsiequipment.duckdns.org")
CREDENTIALS_DIR = os.environ.get("TMSI_CREDENTIALS_DIR", "/home/pedro/tmp/tmsi-sudo")
GOTRUE = f"{BASE}/auth/v1"
REST = f"{BASE}/rest/v1"
TEST_USER_EMAIL = "finance.test@example.test"
TEST_USER_PASSFILE = f"{CREDENTIALS_DIR}/finance-test-password.txt"

REQUIRED_COLUMNS = [
    "product_id", "product_name", "branch_id", "item_type", "currency", "exw_price",
    "primary_branch", "hs_code", "hs_code_zona", "gross_weight_kg",
    "fee_interco_artigo", "margem_artigo", "transporte_artigo",
    "sold_in", "data_calculo",
    "excel_price_interco", "excel_transport", "excel_duty_pct", "excel_duty_amount",
    "excel_total_cost", "excel_margin", "excel_min_price", "excel_reference_price",
    "notas",
]
# sempre obrigatórios, em qualquer linha (filial ou canal)
ALWAYS_REQUIRED = [
    "product_id", "branch_id", "item_type", "currency", "exw_price", "primary_branch",
    "excel_price_interco", "excel_transport", "excel_total_cost", "excel_margin",
    "excel_min_price", "excel_reference_price",
]
# só obrigatórios numa linha de FILIAL — num canal não se aplicam (achado #5/#6)
BRANCH_ONLY_REQUIRED = ["excel_duty_pct", "excel_duty_amount"]
# opcionais em qualquer linha: overrides por artigo (blank = usa o valor por
# omissão da filial) e hs_code_zona (blank = usa o hs_code do artigo)
NUMERIC_COLUMNS = [
    "exw_price", "gross_weight_kg", "fee_interco_artigo", "margem_artigo", "transporte_artigo",
    "excel_price_interco", "excel_transport", "excel_duty_pct", "excel_duty_amount",
    "excel_total_cost", "excel_margin", "excel_min_price", "excel_reference_price",
]
OVERRIDE_COLUMN_KIND = {"fee_interco_artigo": "fee", "margem_artigo": "margin", "transporte_artigo": "transport"}
VALID_ITEM_TYPES = {"equipment", "spare_part", "option", "service"}
PHYSICAL_TYPES = {"equipment", "spare_part"}  # os únicos que pagam transporte/direitos numa filial
NEAR_TIER_TOLERANCE_KG = 2.0


def http_get(path, token):
    req = urllib.request.Request(f"{REST}{path}", headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode())


def login():
    if not os.path.isfile(TEST_USER_PASSFILE):
        raise RuntimeError(f"ficheiro de password não encontrado: {TEST_USER_PASSFILE}")
    password = open(TEST_USER_PASSFILE).read().strip()
    body = json.dumps({"email": TEST_USER_EMAIL, "password": password}).encode()
    req = urllib.request.Request(
        f"{GOTRUE}/token?grant_type=password", data=body,
        headers={"Content-Type": "application/json"}, method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.load(resp)["access_token"]
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"login falhou: http_{e.code}") from None


def parse_number(raw):
    """('valor', None) ou (None, 'motivo'). Aceita vírgula OU ponto como
    decimal, nunca os dois na mesma célula (ambíguo — separador de milhares?)."""
    raw = raw.strip()
    if raw == "":
        return None, None
    if "," in raw and "." in raw:
        return None, "formato misto (vírgula e ponto) — usa só um dos dois"
    try:
        return float(raw.replace(",", ".")), None
    except ValueError:
        return None, "não é um número"


def load_rows(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f, delimiter=";")
        missing = [c for c in REQUIRED_COLUMNS if c not in (reader.fieldnames or [])]
        rows = list(enumerate(reader, start=2))  # linha 1 = cabeçalho
    return reader.fieldnames or [], missing, rows


def validate(path, branches, currencies, hs_codes, channels, zone_by_branch, duty_hs_zones, tiers_by_branch, overrides, overrides_by_kind):
    errors, warnings, notes = [], [], []
    fieldnames, missing, rows = load_rows(path)
    if missing:
        errors.append(f"ficheiro: falta(m) a(s) coluna(s) {', '.join(missing)}")
        return errors, warnings, notes  # sem as colunas, nada mais é fiável de validar

    seen_branches = set()
    near_tier_hits = 0
    duty_hits = 0
    override_hits = 0

    for line_no, row in rows:
        pid = (row.get("product_id") or "").strip()
        branch = (row.get("branch_id") or "").strip()
        primary = (row.get("primary_branch") or "").strip()
        item_type = (row.get("item_type") or "").strip()
        currency = (row.get("currency") or "").strip()
        hs = (row.get("hs_code") or "").strip()
        hs_zona = (row.get("hs_code_zona") or "").strip()
        sold_in_raw = (row.get("sold_in") or "").strip()
        data_calculo = (row.get("data_calculo") or "").strip()

        is_channel = branch in channels
        required_this_row = ALWAYS_REQUIRED + ([] if is_channel else BRANCH_ONLY_REQUIRED)
        for col in required_this_row:
            if not (row.get(col) or "").strip():
                errors.append(f"linha {line_no}: '{col}' está vazio")

        if is_channel:
            notes.append(f"linha {line_no}: branch_id '{branch}' é um canal — o motor ainda não sabe calcular canais "
                          f"(docs/MODEL-GAP-ANALYSIS.md #5/#6); esta linha regista o valor esperado, não compara já com o motor")

        if item_type and item_type not in VALID_ITEM_TYPES:
            errors.append(f"linha {line_no}: item_type '{item_type}' inválido (esperado {'/'.join(sorted(VALID_ITEM_TYPES))})")

        if branch and branch not in branches and branch not in channels:
            errors.append(f"linha {line_no}: branch_id '{branch}' não existe (filial ou canal: {'/'.join(sorted(branches | set(channels)))})")
        elif branch:
            seen_branches.add(branch)

        if primary and primary not in branches:
            errors.append(f"linha {line_no}: primary_branch '{primary}' não existe ({'/'.join(sorted(branches))}) — nunca um canal, é sempre a filial física de origem")

        if currency and currency not in currencies:
            errors.append(f"linha {line_no}: currency '{currency}' não existe ({'/'.join(sorted(currencies))})")

        # hs_code / gross_weight_kg só são obrigatórios para equipment/spare_part
        # (mesma regra da app: 0001, check_activation_requirements)
        if item_type in PHYSICAL_TYPES:
            if not hs:
                errors.append(f"linha {line_no}: hs_code vazio, obrigatório para item_type='{item_type}'")
            if not (row.get("gross_weight_kg") or "").strip():
                errors.append(f"linha {line_no}: gross_weight_kg vazio, obrigatório para item_type='{item_type}'")
        if hs and hs not in hs_codes:
            errors.append(f"linha {line_no}: hs_code '{hs}' não existe na BD")
        if hs_zona and hs_zona not in hs_codes:
            errors.append(f"linha {line_no}: hs_code_zona '{hs_zona}' não existe na BD")

        numbers = {}
        for col in NUMERIC_COLUMNS:
            val, err = parse_number(row.get(col) or "")
            if err:
                errors.append(f"linha {line_no}: '{col}' = '{(row.get(col) or '').strip()}' {err}")
            numbers[col] = val
        weight = numbers["gross_weight_kg"]

        if data_calculo:
            try:
                date.fromisoformat(data_calculo)
            except ValueError:
                errors.append(f"linha {line_no}: data_calculo '{data_calculo}' não é AAAA-MM-DD")

        # a que filial física corresponder esta linha, para as verificações de
        # cobertura abaixo — a do próprio canal (channels[branch]) se for canal
        effective_branch = channels.get(branch, branch) if is_channel else branch

        if sold_in_raw and effective_branch:
            sold_in = {b.strip() for b in sold_in_raw.split(",") if b.strip()}
            if effective_branch not in sold_in:
                warnings.append(f"linha {line_no}: a filial física '{effective_branch}' (de '{branch}') não está em sold_in ({sold_in_raw}) — confirma se a app venderia mesmo aí")

        # cobertura: escalão de transporte perto do limite
        if effective_branch in tiers_by_branch and effective_branch != primary and item_type in PHYSICAL_TYPES and weight is not None:
            for boundary in tiers_by_branch[effective_branch]:
                if boundary is not None and abs(weight - boundary) <= NEAR_TIER_TOLERANCE_KG:
                    near_tier_hits += 1
                    break

        # cobertura: direitos aduaneiros aplicam-se de facto (só faz sentido
        # numa filial real — um canal nunca paga direitos, achado #5/#6)
        if not is_channel and branch and primary and branch != primary and item_type in PHYSICAL_TYPES and hs:
            zone = zone_by_branch.get(branch)
            if zone and (hs, zone) in duty_hs_zones:
                duty_hits += 1

        # cobertura: override activo para este artigo × filial (irrelevante
        # para canais — price_overrides.branch_id só aponta para filiais reais)
        if pid and branch in branches and (pid, branch) in overrides:
            override_hits += 1

        # coerência: coluna de override por artigo preenchida/vazia vs o que
        # a BD realmente tem activo para (produto, filial, tipo)
        if pid and branch in branches:
            for col, kind in OVERRIDE_COLUMN_KIND.items():
                filled = numbers.get(col) is not None
                exists = (pid, branch, kind) in overrides_by_kind
                if filled and not exists:
                    warnings.append(f"linha {line_no}: '{col}' preenchida mas não há override '{kind}' activo na BD para {pid}×{branch} — confirma se falta criar um, ou se o valor é só informativo")
                elif exists and not filled:
                    warnings.append(f"linha {line_no}: existe um override '{kind}' activo na BD para {pid}×{branch} mas '{col}' está vazia — confirma se o Excel já reflecte esse valor")

    missing_branches = sorted(branches - seen_branches)
    if missing_branches:
        warnings.append(f"ficheiro completo: falta(m) representar a(s) filial(is) {', '.join(missing_branches)}")
    if near_tier_hits == 0:
        warnings.append("ficheiro completo: nenhuma linha está perto (±2 kg) de um limite de escalão de transporte")
    if duty_hits == 0:
        warnings.append("ficheiro completo: nenhuma linha testa direitos aduaneiros a aplicarem-se de facto")
    if override_hits == 0:
        warnings.append("ficheiro completo: nenhuma linha coincide com uma margem/taxa forçada (override) activa")

    return errors, warnings, notes


def main():
    if len(sys.argv) != 2:
        print(f"uso: python3 {sys.argv[0]} ficheiro.csv", file=sys.stderr)
        sys.exit(64)
    path = sys.argv[1]
    if not os.path.isfile(path):
        print(f"ficheiro não encontrado: {path}", file=sys.stderr)
        sys.exit(64)

    try:
        token = login()
    except RuntimeError as e:
        print(f"❌ não foi possível autenticar para validar contra a BD: {e}", file=sys.stderr)
        sys.exit(1)

    branches = {b["id"] for b in http_get("/branches?select=id", token)}
    currencies = {c["code"] for c in http_get("/currencies?select=code", token)}
    hs_codes = {h["code"] for h in http_get("/hs_codes?select=code", token)}
    channels_raw = http_get("/channels?select=id,branch_id", token)
    channels = {c["id"]: c["branch_id"] for c in channels_raw}
    zone_by_branch = {b["id"]: b["zone"] for b in http_get("/branches?select=id,zone", token)}
    duty_hs_zones = {(c["hs_code"], c["zone"]) for c in http_get("/customs_rates?select=hs_code,zone,rate&rate=gt.0", token)}
    tiers_raw = http_get("/transport_tiers?select=branch_id,max_weight_kg", token)
    tiers_by_branch = {}
    for t in tiers_raw:
        tiers_by_branch.setdefault(t["branch_id"], []).append(t["max_weight_kg"])
    overrides_raw = http_get("/price_overrides?select=product_id,branch_id,kind", token)
    overrides = {(o["product_id"], o["branch_id"]) for o in overrides_raw}
    overrides_by_kind = {(o["product_id"], o["branch_id"], o["kind"]) for o in overrides_raw}

    errors, warnings, notes = validate(
        path, branches, currencies, hs_codes, channels, zone_by_branch, duty_hs_zones,
        tiers_by_branch, overrides, overrides_by_kind,
    )

    for e in errors:
        print(f"❌ {e}")
    for w in warnings:
        print(f"⚠️  {w}")
    for n in notes:
        print(f"ℹ️  {n}")
    print(f"\n{len(errors)} erro(s), {len(warnings)} aviso(s), {len(notes)} nota(s).")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
