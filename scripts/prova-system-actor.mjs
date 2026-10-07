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
const rem = new Set(['cccccccc-0000-4000-8000-000000000003']);
ok('utilizador removido -> «Removed user» (item 45)', actorLabel('cccccccc-0000-4000-8000-000000000003', de, rem) === 'Removed user');
ok('removido tem de ser explícito: sem o conjunto, volta ao UUID', actorLabel('cccccccc-0000-4000-8000-000000000003', de) === 'cccccccc-0000-4000-8000-000000000003');
ok('system nunca é «Removed user», mesmo que alguém o pusesse no conjunto', actorLabel(SYSTEM_ACTOR_ID, de, new Set([SYSTEM_ACTOR_ID])) === 'system');
ok('um utilizador ainda com perfil não é «Removed user»', actorLabel('aaaaaaaa-0000-4000-8000-000000000001', de, rem) === 'finance@example.test');
import { confirmationMatches, isUuid } from '../app/src/lib/remove-user.ts';
ok('confirmar: email igual', confirmationMatches('Ana@Example.test', 'ana@example.test'));
ok('confirmar: espaços à volta não contam', confirmationMatches('ana@example.test', '  ana@example.test '));
ok('confirmar: email diferente recusado', !confirmationMatches('ana@example.test', 'bruno@example.test'));
ok('confirmar: vazio nunca confirma, nem com conta sem email', !confirmationMatches('', '') && !confirmationMatches(null, '') && !confirmationMatches('ana@example.test', ''));
ok('confirmar: prefixo/sufixo não chega', !confirmationMatches('ana@example.test', 'ana@example') && !confirmationMatches('ana@example.test', 'xana@example.test'));
ok('isUuid aceita um UUID e recusa lixo', isUuid('6ca94ec0-9d0a-4d8c-b09c-ac64ff288266') && !isUuid('1; drop table x') && !isUuid('') && !isUuid('../etc'));
console.log('divergências:', mau); process.exit(mau ? 1 : 0);
