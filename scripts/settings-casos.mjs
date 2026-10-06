// Casos partilhados pela prova em Node e pelo smoke (que os lê daqui e os corre na BD). [chave, valor JSON]
export const CASOS = [
  ['margin_min', '-5'], ['margin_min', '0'], ['margin_min', '1'], ['margin_min', '0.15'], ['margin_min', '"0.15"'], ['margin_min', 'null'], ['margin_min', 'true'],
  ['margin_good', '1.5'], ['margin_good', '0.999'], ['margin_good', '0.0001'], ['margin_target', '0.5'], ['margin_target', '[0.2]'], ['margin_target', '{"v":0.2}'],
  ['fx_tolerance', '-0.1'], ['fx_tolerance', '0.05'], ['fx_tolerance', '1'], ['fx_tolerance', '"0.05"'],
  ['review_days', '-5'], ['review_days', '0'], ['review_days', '45.5'], ['review_days', '90'], ['review_days', '"90"'], ['review_days', '90.0'], ['review_days', 'null'], ['review_days', '1e2'],
  ['fx_source', '"SAP"'], ['fx_source', '""'], ['fx_source', '"   "'], ['fx_source', '12'], ['fx_source', 'null'], ['fx_source', 'true'],
  ['operational_price_notice', 'true'], ['operational_price_notice', 'false'], ['operational_price_notice', '"true"'], ['operational_price_notice', '1'], ['operational_price_notice', 'null'],
  ['chave_desconhecida', '"x"'], ['chave_desconhecida', '-1'],
];
