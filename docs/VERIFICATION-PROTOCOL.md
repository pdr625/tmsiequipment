# TMSI Equipment Price Listing — Protocolo de Verificação de Segurança e Integridade
Copyright © 2026 Pedro Alexandre. Proprietary — see ../LICENSE.

**Natureza:** protocolo re-executável. Cada execução produz um registo datado na secção 7.
**Usos:** teste de aceitação · auditoria periódica · formação de novos utilizadores no
modelo de acessos · evidência perante a direcção de que os dados estão protegidos.
**Quando executar:** antes do primeiro utilizador real; antes do primeiro dado real; antes
de qualquer apresentação à direcção; após cada migração que toque em RLS/vistas/privilégios;
após cada release major.
**Versão do protocolo ligada a:** migrações aplicadas (registar na execução) e digest da app.

## 1. O que este protocolo demonstra — e o que não cobre
Demonstra: que cada perfil de utilizador vê exactamente o que o seu papel permite e nada
mais, **incluindo por acesso directo à API** (contornando a aplicação); que os dados
sensíveis (custos, margens, fornecedores) estão protegidos **na própria base de dados**, não
apenas nos ecrãs; que toda a alteração fica registada com autor e data num registo
inalterável; e que as regras de negócio críticas são impostas pela base (não contornáveis).
Não cobre (tratado noutros documentos — dossier de infra e STATE.md): segurança do servidor
e da rede, backups e recuperação, gestão de credenciais de infraestrutura.

## 2. Modelo de segurança em uma página (para leitura da direcção)
A aplicação tem **quatro camadas independentes**, todas verificadas por este protocolo:
1. **Autenticação** — contas criadas só por administrador (auto-registo desactivado);
   sessões com expiração; links de email de uso único protegidos contra consumo automático
   por scanners de correio corporativo (o link só age com um clique humano).
2. **Autorização por linha (RLS)** — cada consulta à base devolve apenas as linhas que o
   papel e o âmbito (filial/canal) do utilizador permitem; imposto pelo motor da base de
   dados, não pelo código da aplicação.
3. **Autorização por coluna** — os valores financeiros (preço de compra EXW, códigos SAP,
   fornecedor, margens, fees) foram revogados ao nível da base; só uma vista controlada os
   devolve, e apenas a papéis financeiros. Um pedido directo à API por um comercial é
   **recusado pela base de dados**, mesmo que a aplicação tivesse um defeito.
4. **Auditoria imutável** — toda a escrita (produtos, preços, configuração, overrides) gera
   registo com autor real e data, em tabela append-only sem interface de escrita ou limpeza;
   correcções fazem-se por nova entrada, nunca por reescrita (câmbios e overrides guardam o
   histórico completo, incluindo entradas superadas).

## 3. Matriz de visibilidade por papel (a verdade a testar)
Legenda: ✅ vê/pode · ❌ não vê/não pode · ◐ só no seu âmbito (filial/canal) ou só parte da
capacidade (anotado na célula quando não é filial/canal).

*(Verificada célula a célula contra o schema real em 2026-09-04 — funções
`tmsi.can_read_costs()`/`tmsi.can_read_operational()`/`tmsi.products_visible()`, o `see_costs`/
`see_sell` de `tmsi.compute_price()`, e as políticas RLS reais de cada tabela — não assumida a
partir do desenho original. 16 correcções feitas à proposta inicial; detalhe em
`docs/STATE.md`, iteração E3-i7.)*

| Capacidade | admin | product_mgr | finance | branch_mgr | logistics | sales | agent | viewer |
|---|---|---|---|---|---|---|---|---|
| Preços de venda | ✅ | ✅ | ✅ | ◐ | ✅ | ◐ | ◐ | ✅ |
| Custos (EXW, custo total, margens, fees) | ✅ | ✅ | ✅ | ◐ ¹ | ❌ | ❌ | ❌ | ✅ |
| Códigos SAP / fornecedor | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| HS / peso / dimensões (operacional) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| Breakdown do motor de preços | ✅ | ✅ | ✅ | ◐ filial pedida | ❌ | ❌ | ❌ | ✅ |
| Criar/editar produtos | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Configuração (câmbios, fees, transporte, direitos, margens) | ✅ | ❌ | ✅ | ❌ | ◐ transporte/direitos | ❌ | ❌ | ❌ |
| Criar overrides | ✅ | ❌ | ✅ | ◐ transp./margem/coef, filial própria | ◐ só duty, qualquer filial | ❌ | ❌ | ❌ |
| Ver valores de overrides de preço | ✅ | ✅ | ✅ | ◐ filial própria | ◐ só `kind=duty` ³ | ❌ | ❌ | ✅ |
| Auditoria global | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Dashboard (acesso à página) | ✅ | ✅ | ✅ | ✅ ² | ❌ | ❌ | ❌ | ✅ |
| Administração de utilizadores | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Artigos não-activos (draft/review/…) | ✅ | ✅ | ✅ | ◐ | ✅ | ❌ | ❌ | ✅ |

¹ **Duas fontes distintas, com regras diferentes.** O EXW e os códigos SAP/fornecedor vêm de
`tmsi.v_products` (gate: `can_read_costs()`, sem verificação de filial nenhuma — o
`branch_manager` vê-os sem restrição para qualquer produto que já lhe seja visível). O custo
total, a margem e as fees vêm do `tmsi.compute_price()` (gate: `see_costs`, que para o
`branch_manager` verifica explicitamente `b.id = any(tmsi.my_branches())` — **a filial
pedida**, não a do produto) — por isso um `branch_manager` pode ver o EXW de um produto vendido
em várias filiais mas só o `total_cost`/`margin` calculado para a sua própria filial. A célula
usa ◐ para reflectir o caso mais restrito; testar os dois mecanismos separadamente (passos B/L).

² **`/dashboard` (E3-i8) — gate da própria página, não uma nova regra.** `canReadDashboard()`
verifica só `tmsi.can_read_costs()`, sem verificação de filial nenhuma — ao contrário da célula
◐ de "Custos"/"Breakdown do motor" acima, o `branch_manager` entra na página sem restrição. O
que aparece **dentro** do dashboard para esse papel continua condicionado pelas linhas próprias
desta matriz (a margem por filial só mostra a sua, via `tmsi.v_branch_prices`/`compute_price()`)
— o acesso à página em si não é mais restrito que o de `admin`/`finance`/`product_manager`/
`viewer`. Testado nos passos U/V (secção 4.6).

³ **Correcção feita na execução n.º 1 (2026-09-05) — a nota original desta secção estava
errada, não apenas desactualizada.** O texto anterior dizia que `logistics` cria um override
de `duty` "às cegas", sem conseguir voltar a lê-lo — falso. `tmsi.price_overrides` tem duas
políticas RLS permissivas para o mesmo comando: `overrides_read` (`for select`) e
`overrides_write` (**`for all`** — que em Postgres inclui `select`, não só escrita). Políticas
permissivas combinam-se por **OR**, não por AND: mesmo sem `can_read_costs()`, a própria
cláusula `USING` de `overrides_write` (`... or (has_role('logistics') and kind = 'duty')`)
já basta para tornar essa linha visível a um `SELECT`. Verificado ao vivo (`BEGIN`/`ROLLBACK`):
uma linha `kind='duty'` inserida por outra sessão ficou visível a `logistics`; uma linha
`kind='margin'` (id 1, dado real) continuou invisível. **Logistics vê exactamente as linhas
`duty` — de qualquer filial, sem restrição — e mais nenhuma.** Não é uma falha de segurança
(vê apenas o que já está autorizado a escrever), mas o documento anterior descrevia o
comportamento oposto — corrigido aqui, na matriz, e no passo K (secção 4.3).

**Uma nota adicional, não redutível a uma célula:**
- **`Artigos não-activos`** não é filtrado por estado nenhum para `admin`/`product_mgr`/
  `finance`/`logistics`/`viewer` — a única condição para estes cinco papéis é a visibilidade da
  linha em si (`tmsi.products_visible()`), sem cláusula de `status`. Só `branch_manager` (via
  filial) e `sales`/`agent` (via `status='active'`, sempre) têm restrição adicional.

## 4. Protocolo de teste por papel
Para cada papel testado: um utilizador dedicado a testes (em produção: conta de teste real
com o papel, **nunca** a conta pessoal de um colega), duas vias por teste — **browser**
(o que o ecrã mostra) e **API** (o que o payload contém — network tab ou curl; a fuga que
não aparece no ecrã mas viaja no JSON conta como falha). Registar cada linha na tabela da
secção 6.

### 4.1 Papéis financeiros (admin / product_manager / finance) — o ramo positivo
A. Login → listagem de preços completa com custos e margens.
B. Detalhe de artigo → breakdown do motor (câmbio, fee, transporte, direito, margem).
C. Editar um câmbio (com fonte) → o preço recalcula para o valor **previamente calculado à
   mão**; registo na auditoria com o autor certo.
D. Criar um override com motivo e validade → preço muda; expirar/terminar → preço reverte.
E. Auditoria global acessível, filtros funcionais.

### 4.2 Papel comercial (sales) — o ramo negado, o coração da demonstração
F. Browser: listagem só com artigos activos do seu âmbito, sem colunas de custo; `/config`,
   `/audit`, `/admin/users`, `/dashboard` inacessíveis (redirect). `/overrides` **não**
   redirecciona (é aberto a qualquer `authenticated` para a parte de HS — 0001 `ref_read`) mas
   não mostra overrides de preço nem formulário de criação nenhum — não confundir "sem
   redirect" com "sem protecção" neste caso específico.
G. **API directa** (a prova que distingue este protocolo): pedido manual de `exw_price`,
   códigos SAP, fornecedor à tabela de produtos → **recusado pela base** (erro de
   privilégio); pedido às vistas → custos ausentes ou nulos, nunca valores.
H. **Oráculo booleano**: filtrar por coluna vetada (ex.: `exw_price=gt.X`) → recusado —
   nem por inferência se extrai um custo.
I. Escrita: criar/editar produto, override, configuração via API → recusado (RLS).
J. Artigos de outra filial → ausentes, mesmo pedidos por id directo.

### 4.3 Papéis operacionais (logistics / branch_manager / agent / viewer)
K. logistics: vê HS/peso/dimensões e transporte; **não** vê custos/margens (browser e API);
   pode criar um override de `duty` e **vê essa linha depois** (só as de `kind=duty`, nunca
   `margin`/`transport`/`coef` — nota ³, secção 3, corrigida na execução n.º 1); confirmar as
   duas metades: `duty` visível, outro `kind` continua invisível.
L. branch_manager: EXW e códigos SAP sem restrição de filial (uma vez o produto visível);
   custo total/margem calculados **só da sua filial** (nota ¹, secção 3); artigos de outras
   filiais conforme a matriz.
M. agent: só o seu canal; mesmas exclusões do sales.
N. viewer: vê custos, HS/peso, overrides de preço e auditoria global em qualquer filial/canal
   (papel de supervisão, sem âmbito restrito); qualquer escrita via API → recusada.

### 4.4 Integridade das regras de negócio (qualquer papel com escrita)
O. Activar artigo sem HS/peso/SAP → **bloqueado pela base** com erro explícito; excepção
   para opções/serviços confirmada.
P. Alterar EXW de artigo activo → estado `review` + nova versão de preço, automáticos.
Q. Override sem motivo → recusado. Autor de qualquer escrita = sessão autenticada (conferir
   na auditoria), nunca declarável manualmente.
R. Correcção de câmbio no mesmo dia → aceite; entrada superada visível como "superseded";
   consulta histórica devolve a taxa do dia respectivo.

### 4.5 Fluxos de email (com destinatário real atrás de gateway corporativo)
S. Convite: email chega; o link **sobrevive ao scanner** (só age com clique humano);
   definição de password e login funcionam.
T. Reset de password: idem; a password antiga deixa de funcionar.

### 4.6 Dashboard — agregados (E3-i8, adicionado nesta revisão do protocolo)
U. **API:** `tmsi.can_read_costs()` confirmado para cada papel (nota ², secção 3); as vistas
   que o dashboard lê (`tmsi.v_products`, `tmsi.v_branch_prices`, `tmsi.price_overrides`,
   `tmsi.audit_log`) devolvem, para um papel sem `can_read_costs()`, exactamente as mesmas
   linhas/colunas que os testes G–N já verificam para essas mesmas tabelas — o dashboard não
   agrega o que essas vistas já não devolvam (restrição 3 do prompt da i8: agregados não são
   fuga por agregação).
V. **Browser:** como `admin`/`finance`, os números (tiles, margem por filial, overrides
   activos, actividade recente) coerentes com os dados de teste conhecidos; como `sales.sa`
   (ou outro papel sem `can_read_costs()`), `/dashboard` redirecciona.

## 5. Regras de execução em produção
- Executor: o administrador + uma segunda pessoa como testemunha para os testes do ramo
  negado (a demonstração à direcção vale mais com dois nomes).
- Contas de teste com dados reais: usar artigos reais mas contas de teste dedicadas;
  **nunca** pedir credenciais de um colega.
- Qualquer célula em falha: parar, registar, corrigir, **re-executar o protocolo completo**
  do papel afectado — não só o teste que falhou.

## 6. Tabela de registo de uma execução

### Execução n.º 1 — 2026-09-05

| Teste | Papel | Via | Resultado esperado | Resultado obtido | OK/FALHA | Evidência |
|---|---|---|---|---|---|---|
| A | admin/product_manager/finance | API | Listagem completa com custos e margens | `v_branch_prices` devolve 33 linhas com `total_cost_eur` preenchido, para os três papéis | OK | `api-tests-raw-log.txt` L518+ |
| A | admin | Browser | Idem, no ecrã `/prices` | Confirmado pelo Pedro — colunas de custo visíveis | OK | verbal, sem screenshot (ver nota 1) |
| B | admin/product_manager/finance | API | Breakdown do motor preenchido | `fx_used, fee, transport, duty_rate, duty, total_cost, margin, min_price` todos com valor, T-0005/SA, três papéis | OK | `api-tests-raw-log.txt` L518+ |
| B | admin | Browser | Tabela "Price by branch", colunas "Total cost (EUR)" e "Margin" com número | Confirmado pelo Pedro (após correcção da instrução original, ambígua) — "sim, tudo com número — sem traços" | OK | verbal, sem screenshot |
| C | finance | API | Editar câmbio (USD→2.000000) → preço recalcula para o valor calculado à mão antes do teste; audit regista o autor certo | Exacto: `fx_used 0.5, exw_local 725.00, interco 870.00, duty 14.79, total_cost 959.79, min_price 1655.00, ref_price 1821.00` — todos batem com o cálculo prévio; `audit_log.actor` = uid real da finance | OK | `api-tests-raw-log.txt` L610-640 |
| D | finance | API | Criar override (coef 1.5, T-0002/SA) → preço muda para o valor calculado à mão; expirar → preço reverte à base | Base `189.00/208.00` → override `283.00/311.00` (exacto) → expirado `189.00/208.00` (exacto, reverteu) | OK | `api-tests-raw-log.txt` L641-693 |
| E | admin/finance | API | Auditoria global acessível, filtros funcionam | admin 128 linhas; finance 128 linhas, filtro `table_name=price_overrides` → 4 | OK | `api-tests-raw-log.txt` L518+ |
| E | product_manager | API | `product_manager` **excluído** de `audit_read` (matriz) | `count(*) from audit_log` = 0 | OK | `api-tests-raw-log.txt` L518+ |
| E | admin | Browser | Filtro por tabela em `/audit` | Confirmado pelo Pedro | OK | verbal, sem screenshot |
| F | sales.sa | Browser | Listagem restrita à filial, sem custos; `/config`,`/audit`,`/admin/users`,`/dashboard` redireccionam | Confirmado pelo Pedro — "tudo ok, nenhum deixou entrar" | OK | verbal, sem screenshot |
| F | sales.sa | API | Idem via `v_products`/`v_branch_prices` | Custos `NULL`, não ausentes; branches fora do âmbito devolvem 0 linhas | OK | `api-tests-raw-log.txt` L1-56 |
| F | sales.sa | Browser | `/overrides`: HS overrides visível (mesmo vazio), price overrides sem valores nem formulário | Confirmado pelo Pedro | OK | verbal, sem screenshot |
| G | sales.sa | API | `SELECT exw_price`/`sap_code_sa`/`supplier_id` directo em `tmsi.products` → erro de privilégio | `ERROR: permission denied for table products` nas duas tentativas | OK | `api-tests-raw-log.txt` L17-24 |
| H | sales.sa | API | Filtrar por coluna vetada (`exw_price > 100`) → erro, não silêncio | `ERROR: permission denied for table products` | OK | `api-tests-raw-log.txt` L27-29 |
| I | sales.sa | API | Escrita em `products`/`price_overrides`/`exchange_rates` → negada | RLS a negar as três (`new row violates row-level security policy`) | OK | `api-tests-raw-log.txt` L32-41 |
| J | sales.sa | API | Artigo com `sold_in` sem SA (T-9004) → ausente, mesmo por id directo | 0 linhas em `v_products` e `products` | OK | `api-tests-raw-log.txt` L44-53 |
| K | logistics.test | API | HS/peso/transporte visíveis, custos não; cria `duty`; **lê** `duty` depois (não outros `kind`) — corrigido nesta execução | `v_products`: HS/peso ✅, EXW `NULL`; `transport_tiers`/`customs_rates` legíveis; `exchange_rates`/`interco_fees`/`margin_grids` = 0; override `duty` criado e **visível** depois; override `margin` (id 1, real) continua invisível; tentativa de criar `margin` → negada | OK (protocolo corrigido, ver commit `c01325a`) | `api-tests-raw-log.txt` L94-198 |
| K | logistics.test | Browser | — | **Não executado** — sessão 3 dispensada pelo Pedro (tempo), coberto pela prova API acima | N/A | — |
| L | branch_manager.test (CORP) | API | EXW/SAP sem restrição de filial; custo/margem só da filial pedida (CORP); escrita só transport/margin/coef na própria filial | EXW/SAP visíveis; `compute_price('T-0005','CORP')` com custos, `compute_price('T-0005','SA')` = 0 linhas; escreve `margin` em CORP, nega em SA e nega `duty` em CORP; `audit_log` acessível (128) | OK | `api-tests-raw-log.txt` L199-259 |
| L | branch_manager.test | Browser | — | **Não executado** — idem | N/A | — |
| M | agent.apac (canal APAC → filial TBM) | API | Só vê preço de venda da filial do seu canal, sem custos | Custos `NULL`; `compute_price('T-0004','TBM')` mostra min/ref; `compute_price('T-0004','LTD')` = 0 linhas; escrita negada; `audit_log`=0; dashboard gate=`false` | OK | `api-tests-raw-log.txt` L260-332 |
| M | agent.apac | Browser | — | **Não executado** — idem | N/A | — |
| N | viewer (conta real, não `.test`) | API | Visibilidade total sem âmbito, zero escrita | Custos visíveis em SA/CORP/LTD sem restrição; `overrides`=4, `audit_log`=128; escrita em `price_overrides` negada (erro), em `products` negada (0 linhas afectadas — nota 2) | OK | `api-tests-raw-log.txt` L333-388 |
| N | viewer | Browser | — | **Não executado** — idem | N/A | — |
| O | admin | API | Activar sem HS/peso/SAP → bloqueado; opção/serviço isento | T-8515 (equipment, sem HS) → `ERROR: Product T-8515 cannot be active without an HS code`; T-9004 (option, sem HS) → `UPDATE 1`, aceite | OK | `api-tests-raw-log.txt` L389-465 |
| P | admin | API | Alterar EXW de artigo activo → `review` + nova versão | T-0005: `active/890.00` → `review/950.00`; `price_versions` 3→4, última versão com `exw_price 950.00`; revertido, confirmado de volta a `active/890.00` | OK | `api-tests-raw-log.txt` L389-465 |
| Q | admin | API | Override sem motivo → recusado; autor sempre a sessão real (via auditoria) | `NULL` em `reason` → `ERROR: null value ... violates not-null constraint`; `created_by` **não** é imposto pela BD (aceitou um UUID falso — achado já conhecido/documentado, i6 F0 #1); mas `audit_log.actor` continua a ser o uid **real** da sessão, independente do que vai em `created_by` — o registo de autoria que importa (auditoria) é inviolável mesmo quando o campo de conveniência não é | OK (com nota) | `api-tests-raw-log.txt` L389-465, L466-485 |
| R | finance | API | Correcção de câmbio no mesmo dia aceite; ramo histórico intacto | Segunda entrada USD/GBP no mesmo dia aceite, `fx_rate()` usa-a de imediato; `fx_rate('GBP','2025-11-01')` devolve a taxa original da seed | OK | `api-tests-raw-log.txt` L486-517 |
| S | admin + Pedro | Browser | Convite chega; link sobrevive; password + login funcionam | Confirmado pelo Pedro, **dois** provedores reais (Gmail de teste e Hotmail) | OK — **ver desvio** | verbal, sem screenshot |
| T | Pedro | Browser | Reset funciona; password antiga falha depois | Confirmado — "ok: pass antiga falhou" | OK | verbal, sem screenshot |
| U | sales.sa/logistics.test/agent.apac | API | `can_read_costs()`=`false`; zero linhas em `v_branch_prices`(margem)/`price_overrides`/`audit_log` mesmo contornando o redirect | Confirmado para os três papéis | OK | `api-tests-raw-log.txt` (vários) |
| U | admin/product_manager/finance/branch_manager/viewer | API | `can_read_costs()`=`true` (gate da página) | Confirmado para os cinco papéis | OK | `api-tests-raw-log.txt` (vários) |
| V | admin | Browser | Números do dashboard coerentes com os dados conhecidos | Confirmado pelo Pedro | OK | verbal, sem screenshot |
| V | sales.sa | Browser | `/dashboard` redirecciona | Confirmado pelo Pedro (bloco F, passo 6) | OK | verbal, sem screenshot |

**Nota 1 — evidência do Pedro é verbal, não screenshot.** A restrição 3 do prompt pedia
screenshots; a sessão decorreu por chat, sem anexos. Registado como está — nenhuma evidência
fabricada. Se for exigido nível de prova mais forte (ex. para a direcção), repetir os passos de
browser com captura de ecrã real.

**Nota 2 — duas formas de negação distintas, ambas correctas.** `INSERT` negado por RLS devolve
`ERROR: new row violates row-level security policy`; um `UPDATE` cujo `WHERE` aponta para uma
linha que a política não deixa tocar devolve `UPDATE 0` (sem erro) — o padrão "200/0 linhas
ambíguo" já identificado nesta sessão (i4/i5). Ambos são recusas correctas; distinguidos aqui
para não serem confundidos com sucesso parcial.

**Achado de processo, registado no fecho:** o próprio protocolo tinha dois defeitos reais,
corrigidos antes/durante esta execução (restrição 1 do prompt) — `/dashboard` (E3-i8) não
constava do documento (commit `e9b1ab8`); e a nota sobre `logistics` não conseguir ler
overrides que cria estava **errada**, não só desactualizada — `overrides_write` é `for all`
(inclui `select`), OR-combinada com `overrides_read`, tornando as linhas `duty` visíveis a
`logistics` (commit `c01325a`, achado do teste K).

## 7. Registo de execuções do protocolo
| Data | Versão (migrações + digest) | Executor(es) | Âmbito (papéis) | Resultado | Desvios/acções |
|---|---|---|---|---|---|
| 2026-09-05 | Migrações 0001–0005; digest `sha256:3775da62ecfc16047b7eec92b7ea98cb277778825d8295b4771becf3b1b47da1` | Pedro (browser) + agente (API) | admin, product_manager, finance, branch_manager, logistics, sales, agent, viewer — os 8 papéis da matriz | **OK — gate de produção satisfeito para o estado actual** (migrações 0001–0005 + digest acima) | (1) Protocolo tinha 2 defeitos reais, corrigidos antes/durante a execução (ver acima; commits `e9b1ab8`, `c01325a`). (2) Utilizador de teste `branch_manager.test@example.test` criado (não existia). (3) Sessão 3 (K–N, parte visual) dispensada pelo Pedro por tempo — coberta pela prova API, que é completa. (4) S/T testados só com Gmail+Hotmail (dois provedores reais, sem gateway corporativo) — a variante EOP/Safe-Links continua **por cobrir**, fica registada como pendência da E5 (quarentena Microsoft 365, já conhecida desde a i3). (5) Evidência do Pedro é verbal (chat), não screenshot — ver nota 1, secção 6. |

**Adenda, 2026-09-05 (E5-VPS) — tentativa de fechar o desvio (4):** o passo manual pedia ao
Pedro para libertar a quarentena EOP em `security.microsoft.com` (tenant `@condat.fr`) antes de
um novo teste de reset de password. **Bloqueado num ponto anterior ao previsto pelo protocolo:**
o Pedro confirmou **não ter acesso** (permissões/role) àquele portal para esse tenant — não é
o caso de "a mensagem voltou à quarentena" que a secção 5 do protocolo antecipa, é não haver
sequer acesso para verificar. Sem a libertação, não faz sentido disparar o reset de teste (só
repetiria a mesma quarentena já documentada na i3). **Não insistido mais** — o caminho seguinte
(pedido de acesso ou de libertação à TI do tenant) é decisão do Pedro, fora desta sessão. O
desvio (4) continua **por cobrir**, agora com uma causa mais precisa registada; primeiro item
da E5 (`docs/ROADMAP.md`).
