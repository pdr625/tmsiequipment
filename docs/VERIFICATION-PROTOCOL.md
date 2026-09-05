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
| Ver valores de overrides de preço | ✅ | ✅ | ✅ | ◐ filial própria | ❌ | ❌ | ❌ | ✅ |
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

**Duas notas adicionais, não redutíveis a uma célula:**
- **Assimetria em `price_overrides`:** `logistics` pode **criar** um override de `duty`
  (`overrides_write`) mas **não pode ler** a tabela depois (`overrides_read` exige
  `can_read_costs()`, que `logistics` não tem) — cria às cegas, sem confirmação visual
  possível na tabela de overrides. Comportamento real da 0001, não introduzido pela i6;
  registado aqui para não ser confundido com um defeito durante o teste do passo I/K.
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
   pode criar um override de `duty` mas não vê depois os valores de overrides (nota da
   secção 3) — confirmar que este é o comportamento esperado, não um erro de teste.
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
| Teste | Papel | Via (browser/API) | Resultado esperado | Resultado obtido | OK/FALHA | Evidência (screenshot/log) |
|---|---|---|---|---|---|---|
*(uma linha por teste A–T executado; anexar evidências datadas)*

## 7. Registo de execuções do protocolo
| Data | Versão (migrações + digest) | Executor(es) | Âmbito (papéis) | Resultado | Desvios/acções |
|---|---|---|---|---|---|
| *(primeira execução formal: por agendar)* | | | | | |
