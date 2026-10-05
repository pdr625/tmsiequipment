// Prova de equivalência: app/src/lib/perms.ts (funções puras sobre o me()) vs as respostas REAIS da
// BD (has_role, can_read_costs, my_branches) — as chamadas que cada página fazia antes de 2026-10-05.
// Corre o ficheiro REAL no Node 24 da imagem da app (executa TypeScript), sem rede.
//   docker run --rm -i --network none --entrypoint node -v <repo>:/r:ro <imagem> /r/scripts/prova-perms.mjs < casos.json
// Entrada (stdin): [{ papel, me: {...linha de me()...}, bd: { admin, product_manager, finance, viewer,
//   branch_manager, logistics, can_read_costs, my_branches } }]. Sai com 1 se algo divergir.
import * as P from '../app/src/lib/perms.ts';
import { readFileSync } from 'node:fs';

const casos = JSON.parse(readFileSync(0, 'utf8'));
let mau = 0;
const ok = (nome, cond, extra = '') => { console.log(`${cond ? 'OK ' : 'XX '} ${nome}${extra ? ' — ' + extra : ''}`); if (!cond) mau++; };

// O que a BD DIZ (guardas antigas escritas em termos das respostas reais da BD).
const oraculo = (b) => ({
  isAdmin: b.admin,
  canManageProducts: b.admin || b.product_manager,
  canManageFinanceConfig: b.admin || b.finance,
  canManageOperationalConfig: b.admin || b.finance || b.logistics,
  canManageAnyPriceOverride: b.admin || b.finance || b.branch_manager || b.logistics,
  canReadDashboard: b.can_read_costs,
  canReadAuditLog: b.admin || b.finance || b.viewer || b.branch_manager,
  isBranchManager: b.branch_manager,
  readCosts: b.can_read_costs,
  readLogistics: b.logistics,
});
const obtido = (me) => ({
  isAdmin: P.isAdmin(me), canManageProducts: P.canManageProducts(me), canManageFinanceConfig: P.canManageFinanceConfig(me),
  canManageOperationalConfig: P.canManageOperationalConfig(me), canManageAnyPriceOverride: P.canManageAnyPriceOverride(me),
  canReadDashboard: P.canReadDashboard(me), canReadAuditLog: P.canReadAuditLog(me), isBranchManager: P.isBranchManager(me),
  readCosts: P.pricingConfigReadAccess(me).readCosts, readLogistics: P.pricingConfigReadAccess(me).readLogistics,
});

for (const c of casos) {
  const quer = oraculo(c.bd), tem = obtido(c.me);
  const dif = Object.keys(quer).filter((k) => quer[k] !== tem[k]);
  ok(`${c.papel}: as 10 decisões de perms.ts batem com a BD`, dif.length === 0, dif.length ? `divergem: ${dif.join(', ')}` : '');
  ok(`${c.papel}: me().branches bate com my_branches()`,
     JSON.stringify([...c.me.branches].sort()) === JSON.stringify([...(c.bd.my_branches ?? [])].sort()));
}

// Papéis sem conta de teste (admin, viewer) e o caso sem identidade: não há BD ao vivo, por isso o
// oráculo é escrito À MÃO a partir das definições de auth-guard.ts / das políticas RLS.
const base = { user_id: 'u', full_name: null, can_read_operational: true, branches: [], channels: [], must_change_password: false };
const admin = { ...base, roles: ['admin'], can_read_costs: true };
const viewer = { ...base, roles: ['viewer'], can_read_costs: true };
const sales = { ...base, roles: ['sales'], can_read_costs: false };
ok('admin (sem conta de teste): tudo permitido, incluindo as de config e auditoria',
   P.isAdmin(admin) && P.canManageProducts(admin) && P.canManageFinanceConfig(admin) && P.canManageOperationalConfig(admin)
   && P.canManageAnyPriceOverride(admin) && P.canReadDashboard(admin) && P.canReadAuditLog(admin));
ok('viewer (sem conta de teste): lê auditoria e dashboard, não escreve nada',
   P.canReadAuditLog(viewer) && P.canReadDashboard(viewer) && !P.isAdmin(viewer) && !P.canManageProducts(viewer)
   && !P.canManageFinanceConfig(viewer) && !P.canManageAnyPriceOverride(viewer));
ok('sales: nada de custos, auditoria, config ou escrita',
   !P.canReadDashboard(sales) && !P.canReadAuditLog(sales) && !P.canManageProducts(sales) && !P.pricingConfigReadAccess(sales).readCosts);
ok('sem identidade (me nulo): tudo falso, como as guardas fariam',
   [P.isAdmin, P.canManageProducts, P.canManageFinanceConfig, P.canManageOperationalConfig, P.canManageAnyPriceOverride,
    P.canReadDashboard, P.canReadAuditLog, P.isBranchManager].every((f) => f(null) === false)
   && P.pricingConfigReadAccess(null).readCosts === false && P.pricingConfigReadAccess(null).readLogistics === false);
ok('logistics lê configuração mas não o dashboard nem a auditoria (decisões de i8/audit_read)',
   (() => { const l = { ...base, roles: ['logistics'], can_read_costs: false };
     return P.pricingConfigReadAccess(l).readLogistics && !P.canReadDashboard(l) && !P.canReadAuditLog(l) && P.canManageOperationalConfig(l) && !P.canManageFinanceConfig(l); })());
console.log('divergências:', mau);
process.exit(mau ? 1 : 0);
