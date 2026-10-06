// Prova da validação de `tmsi.settings` na app (app/src/lib/settings-validation.ts), a lógica PURA. Corre o ficheiro REAL no Node 24
// da imagem (executa TypeScript), sem rede. Imprime uma linha por caso «chave|json|ok» ou «chave|json|recusa» — o smoke compara
// com o que a BD decide para os MESMOS casos.
import { validateSetting, settingInputText, parseSettingInput } from '../app/src/lib/settings-validation.ts';
import { CASOS } from './settings-casos.mjs';
let mau = 0;
for (const [chave, json] of CASOS) {
  let v; try { v = JSON.parse(json); } catch { console.log(`${chave}|${json}|recusa`); continue; }
  const r = validateSetting(chave, v) === null ? 'ok' : 'recusa';
  console.log(`${chave}|${json}|${r}`);
  if (r === 'recusa' && !validateSetting(chave, v)) mau++;
  if (r === 'recusa' && typeof validateSetting(chave, v) !== 'string') mau++;
}
// item 93: apresentação e leitura do texto de cada chave (não vão à BD; só a lógica da app)
const T = (nome, cond) => { console.log(`# ${cond ? 'OK' : 'XX'} ${nome}`); if (!cond) mau++; };
T('fx_source "SAP" mostra-se SAP, sem aspas', settingInputText('fx_source', 'SAP') === 'SAP');
T('margin_min 0.15 mostra-se 0.15', settingInputText('margin_min', 0.15) === '0.15');
T('operational_price_notice true mostra-se true', settingInputText('operational_price_notice', true) === 'true');
T('uma chave desconhecida com texto continua JSON ("x" com aspas)', settingInputText('outra', 'x') === '"x"');
T('fx_source: texto simples ECB -> "ECB"', JSON.stringify(parseSettingInput('fx_source', 'ECB')) === '{"ok":true,"value":"ECB"}');
T('fx_source: com aspas "ECB" -> ECB (sem aspas dentro do valor)', JSON.stringify(parseSettingInput('fx_source', '"ECB"')) === '{"ok":true,"value":"ECB"}');
T('fx_source: espaços à volta são cortados', JSON.stringify(parseSettingInput('fx_source', '  ECB ')) === '{"ok":true,"value":"ECB"}');
T('fx_source: 12 fica texto "12"', JSON.stringify(parseSettingInput('fx_source', '12')) === '{"ok":true,"value":"12"}');
T('fx_source: vazio -> "" (recusado depois por validateSetting)', parseSettingInput('fx_source', '').value === '' && validateSetting('fx_source', '') !== null);
T('margin_min: 0.15 -> número', JSON.stringify(parseSettingInput('margin_min', '0.15')) === '{"ok":true,"value":0.15}');
T('margin_min: texto sem JSON -> erro', parseSettingInput('margin_min', 'abc').ok === false);
T('margin_min: "0.15" (texto) continua a ser texto e é recusado', validateSetting('margin_min', parseSettingInput('margin_min', '"0.15"').value) !== null);
process.exit(mau ? 1 : 0);
