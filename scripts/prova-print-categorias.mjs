// Prova da lógica de categorias do /prices (app/src/lib/print-categorias.ts), a PURA, sem React.
// Corre o ficheiro REAL (Node 24 executa TypeScript directamente): no smoke, dentro do
// contentor da app, sem rede — `docker run --rm --network none --entrypoint node -v <repo>:/r:ro
// <imagem do tmsi-app> /r/scripts/prova-print-categorias.mjs`. Sai com 1 se algo divergir.
import { categoriaValida, regrasCategorias, resumo, SEM_CATEGORIA } from '../app/src/lib/print-categorias.ts';
let bad = 0; const t = (nome, ok, extra='') => { console.log(ok ? 'OK ' : 'XX ', nome, extra); if (!ok) bad++; };
const validos = new Set(['PUMP', 'PROFOAM_SP', 'A.b-1', SEM_CATEGORIA]);
t('ids normais são aceites', ['PUMP','PROFOAM_SP','A.b-1','__none'].every(i => categoriaValida(i, validos)));
t('id desconhecido é recusado', !categoriaValida('OUTRA', validos));
// ataques: tudo o que tente sair do atributo/regra de CSS
const hostis = ['x"]{display:none}body{background:red}/*', 'PUMP"] , body{display:none} tr[data-cat="PUMP', "PUMP'", 'PUMP]', 'PUMP\n', 'PUMP ', '', 'a'.repeat(41), '</style><script>alert(1)</script>', 'PUMP;x', 'PUMP\\', 'PUMP{', 'PUMP}'];
const todos = new Set([...validos, ...hostis]);   // mesmo que o atacante "registe" o id na lista de válidos...
t('ids hostis são recusados pela FORMA (mesmo se constassem da lista)', hostis.every(i => !categoriaValida(i, todos)));
const css = regrasCategorias(['PUMP', ...hostis, 'DESCONHECIDO', 'A.b-1'], validos);
t('só as regras legítimas são geradas', css === '@media print{#prices-root tr[data-cat="PUMP"]{display:none}#prices-root tr[data-cat="A.b-1"]{display:none}}', '\n    ' + css);
t('sem nada escondido não há CSS', regrasCategorias([], validos) === '' && regrasCategorias(hostis, validos) === '');
t('o CSS gerado não contém aspas nem chavetas extra', !/[<>;\\]/.test(css.replace(/\{display:none\}/g,'').replace('@media print{','').slice(0,-1)));
const cats = [{id:'PUMP',label:'Pumps (PUMP)',count:5},{id:'PROFOAM_SP',label:'x',count:17},{id:'__none',label:'Uncategorised',count:3}];
let r = resumo(cats, []);
t('sem selecção: não é parcial, 25 de 25', !r.parcial && r.linhasImpressas === 25 && r.linhasTotal === 25);
r = resumo(cats, ['PROFOAM_SP']);
t('esconder uma: parcial, 8 de 25, 2 categorias impressas', r.parcial && r.linhasImpressas === 8 && r.categoriasImpressas.length === 2);
r = resumo(cats, ['PUMP','PROFOAM_SP','__none']);
t('esconder todas: parcial, 0 de 25', r.parcial && r.linhasImpressas === 0 && r.categoriasImpressas.length === 0);
r = resumo(cats, ['NAO_EXISTE','x"]']);
t('ids que não existem não contam como parcial', !r.parcial && r.linhasImpressas === 25);
console.log('divergências:', bad); process.exit(bad ? 1 : 0);
