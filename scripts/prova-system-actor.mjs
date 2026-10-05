// Prova do rótulo do autor no /audit (app/src/lib/system-actor.ts), a lógica PURA. Corre o ficheiro REAL no Node 24 da imagem da app
// (executa TypeScript), sem rede: docker run --rm --network none --entrypoint node -v <repo>:/r:ro <imagem> /r/scripts/prova-system-actor.mjs
import { SYSTEM_ACTOR_ID, actorLabel } from '../app/src/lib/system-actor.ts';
let mau = 0;
const ok = (nome, cond) => { console.log(`${cond ? 'OK ' : 'XX '} ${nome}`); if (!cond) mau++; };
const emails = { 'aaaaaaaa-0000-4000-8000-000000000001': 'finance@example.test' };
const de = (id) => emails[id];
ok('o UUID de system tem a forma de um UUID', /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(SYSTEM_ACTOR_ID));
ok('system não é o UUID nulo (00000000-…-0000) nem de um utilizador aleatório', SYSTEM_ACTOR_ID !== '00000000-0000-0000-0000-000000000000' && SYSTEM_ACTOR_ID.startsWith('00000000-0000-0000-0000-'));
ok('autor system -> «system»', actorLabel(SYSTEM_ACTOR_ID, de) === 'system');
ok('autor nulo (linhas anteriores à 0022) -> «system (legacy, no identity)»', actorLabel(null, de) === 'system (legacy, no identity)');
ok('utilizador visível -> o e-mail', actorLabel('aaaaaaaa-0000-4000-8000-000000000001', de) === 'finance@example.test');
ok('utilizador não visível a quem lê -> o UUID (nunca «system»)', actorLabel('bbbbbbbb-0000-4000-8000-000000000002', de) === 'bbbbbbbb-0000-4000-8000-000000000002');
ok('system nunca se resolve pelo e-mail, mesmo que alguém o registasse', actorLabel(SYSTEM_ACTOR_ID, () => 'intruso@example.test') === 'system');
console.log('divergências:', mau); process.exit(mau ? 1 : 0);
