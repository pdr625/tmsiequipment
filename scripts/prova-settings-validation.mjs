// Prova da validação de `tmsi.settings` na app (app/src/lib/settings-validation.ts), a lógica PURA. Corre o ficheiro REAL no Node 24
// da imagem (executa TypeScript), sem rede. Imprime uma linha por caso «chave|json|ok» ou «chave|json|recusa» — o smoke compara
// com o que a BD decide para os MESMOS casos.
import { validateSetting } from '../app/src/lib/settings-validation.ts';
import { CASOS } from './settings-casos.mjs';
let mau = 0;
for (const [chave, json] of CASOS) {
  let v; try { v = JSON.parse(json); } catch { console.log(`${chave}|${json}|recusa`); continue; }
  const r = validateSetting(chave, v) === null ? 'ok' : 'recusa';
  console.log(`${chave}|${json}|${r}`);
  if (r === 'recusa' && !validateSetting(chave, v)) mau++;
  if (r === 'recusa' && typeof validateSetting(chave, v) !== 'string') mau++;
}
process.exit(mau ? 1 : 0);
