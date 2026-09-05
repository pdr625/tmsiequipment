# Guião — onboarding do piloto (2-3 colegas)

**Estado:** pré-requisitos satisfeitos 2026-09-05. Digest em produção
`sha256:8b466fa373f473ef9ac94cb720e9110ea02170bf7908f94271fa220a2c77346a` (migrações
0001–0006). Mecanismo testado ao vivo ponta-a-ponta com uma conta descartável antes deste
guião ser escrito — ver `docs/STATE.md`, secção "Piloto — preparação do onboarding", e a
adenda correspondente em `docs/VERIFICATION-PROTOCOL.md`.

Este é o fluxo que **funciona hoje**, não o desenho original — foi corrigido um bloqueio real
(reset de admin não confirmava o email de um convite fresco) antes deste documento existir.

---

## Antes de começares

- **A password de cada colega nunca deve ser escrita em chat, email ou qualquer ficheiro.**
  Aparece uma única vez no ecrã do passo 3 — decora-a ou aponta-a à mão nesse momento, e
  comunica-a ao colega directamente (pessoalmente ou por telefone), nunca por escrito num
  canal que fique gravado.
- Cada colega precisa de: um email (usado como identificador de login, não recebe
  necessariamente nada — a entrega de email neste projecto não é garantida, é por isso que
  este mecanismo existe) e um papel (tabela abaixo).
- Fazes tudo isto autenticado como admin, em `/admin/users`, no browser.

## Papéis disponíveis (resumo — matriz completa em `VERIFICATION-PROTOCOL.md` secção 3)

| Papel | Vê custos/margens? | Precisa de filial/canal? | Uso típico |
|---|---|---|---|
| `finance` | ✅ tudo | não | financeiro, sem restrição de filial |
| `product_manager` | ✅ tudo | não | gere produtos, sem custos de config |
| `admin` | ✅ tudo | não | administração completa — atribui com cautela |
| `viewer` | ✅ tudo, só leitura | não | visão total, zero escrita |
| `branch_manager` | ◐ só a sua filial | **sim — filial** | gestor de uma filial (SA/LTD/CORP/TBM) |
| `logistics` | ❌ nunca custos | não | operações (HS, peso, transporte) |
| `sales` | ❌ nunca custos | **sim — filial** | vendas de uma filial, sem custos |
| `agent` | ❌ nunca custos | **sim — canal** | agente de um canal (só existe `APAC`→`TBM` hoje) |

Filiais existentes: `SA`, `LTD`, `CORP`, `TBM`. Canais existentes: `APAC` (ligado a `TBM`).
Se o colega não se encaixa em `branch_manager`/`sales`/`agent`, deixa filial/canal em branco.

## Passo a passo, por colega

1. **Convidar** — secção "Invite new user (email)", escreve o email real do colega, "Send
   invite". Cria a conta; o email de convite pode não chegar (não interessa, o resto do fluxo
   não depende dele).
2. **Atribuir papel** — na linha do utilizador acabado de criar, escolhe o "Role" da tabela
   acima e, se for `branch_manager`/`sales`, a "Branch"; se for `agent`, o "Channel". "Add
   role".
3. **Reset password** — na mesma linha, deixa marcada a opção por omissão "Generate temporary
   password" (não "Set manually" — é a gerada, forte, única, que este mecanismo existe para
   produzir) e carrega em "Reset password". **A password aparece uma única vez**, numa caixa
   amarela — copia-a/decora-a imediatamente, um refresh da página perde-a para sempre (terás
   de repetir este passo, o que gera uma nova, se isso acontecer).
4. **Comunicar** — entrega a password ao colega directamente (voz, não escrito).
5. **Primeiro login do colega** — o colega entra em `/login` com o email + a password
   temporária. A app força-o de imediato para `/account/password`: aí define a password dele
   próprio (a temporária deixa de servir a partir desse momento). Depois disso, acesso normal
   ao que o papel dele permitir.

Repete os passos 1–4 para cada um dos 2–3 colegas.

## Checklist (uma linha por colega)

| Nome | Email | Papel | Filial/Canal | Password comunicada | 1º login confirmado |
|---|---|---|---|---|---|
| | | | | ☐ | ☐ |
| | | | | ☐ | ☐ |
| | | | | ☐ | ☐ |

## Se algo correr mal

- **Colega não consegue entrar, "Email not confirmed" ou password recusada:** não deveria
  acontecer com o mecanismo actual (achado corrigido antes deste guião) — se acontecer, é uma
  regressão real, não um passo em falta desta lista. Pára e regista, não tentes contornar por
  fora do `/admin/users`.
- **Perdeste a password gerada antes de a entregar:** repete o passo 3 — cada "Reset
  password" gera um valor novo, não há forma de recuperar o anterior (por desenho, nunca
  fica guardado em lado nenhum).
- **Colega banido por engano, ou precisas de o desactivar:** botão "Disable"/"Reactivate" na
  linha do utilizador — se a leitura do estado de ban ao GoTrue falhar, a página mostra um
  aviso "Ban status unavailable" em vez de assumir "activo" (achado #2, tarefa 6).

## Depois do onboarding

Recolhe feedback de cada colega (o que confundiu, o que faltou, o que não bateu certo com o
que esperavam do papel) — informa a L2 (`docs/BACKLOG.md` item 9) e as próximas iterações.
Quando os 2-3 estiverem a usar a app com regularidade, o item 8 do `docs/BACKLOG.md` pode ser
riscado.
