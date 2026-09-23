import assert from 'node:assert/strict';
import fs from 'node:fs';
const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
assert.ok(app.includes('Pourboires par employé'));
assert.ok(app.includes('tipsByOperator'));
assert.ok(app.includes('tip_operator_name_snapshot'));
assert.ok(app.includes('report.netTips'));
console.log('POS tips-by-operator report UI checks passed');
