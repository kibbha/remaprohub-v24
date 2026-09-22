import fs from 'node:fs';
import assert from 'node:assert/strict';
import {applyDeliveryAiReceiving,stockAvailable} from '../src/store.js';
import {confidenceBand,confidenceLabel,DELIVERY_AI_MAX_PHOTOS} from '../src/delivery-ai.js';

assert.equal(DELIVERY_AI_MAX_PHOTOS,8);
assert.equal(confidenceBand(.90),'recognized');
assert.equal(confidenceBand(.89),'verify');
assert.equal(confidenceBand(.70),'verify');
assert.equal(confidenceBand(.69),'required');
assert.equal(confidenceLabel(.95,'fr'),'Reconnu');

const existing={id:'stock-a',name:'Lait',unit:'l',qty:10,price:1.2,min:0,reorderTarget:0};
const state={stock:[existing],stockMoves:[],deliveries:[],waste:[],suppliers:[]};
const before=stockAvailable(state,existing);
assert.equal(before,10);
assert.equal(state.stockMoves.length,0);

const result=applyDeliveryAiReceiving(state,{
  analysisId:'analysis-1',supplier:'Fournisseur test',date:'2026-09-22',
  items:[
    {stockId:'stock-a',name:'Lait',quantity:6,unit:'l',brand:'Test',packaging:'6 x 1 L',barcode:'7612345678901'},
    {stockId:'',name:'Jus pomme',quantity:2,unit:'caisse',brand:'Maison',packaging:'12 x 33 cl',barcode:'7611111111111'}
  ]
});
assert.ok(result);
assert.equal(result.movements,2);
assert.equal(result.createdProducts,1);
assert.equal(stockAvailable(state,existing),16);
assert.ok(state.stock.find(x=>x.name==='Jus pomme'));
assert.equal(state.stockMoves.filter(x=>x.deliveryAnalysisId==='analysis-1').length,2);
assert.equal(applyDeliveryAiReceiving(state,{analysisId:'analysis-1',items:[{stockId:'stock-a',name:'Lait',quantity:1,unit:'l'}]}),false);

const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const client=fs.readFileSync(new URL('../src/delivery-ai.js',import.meta.url),'utf8');
const edge=fs.readFileSync(new URL('../supabase/functions/remapro-delivery-ai/index.ts',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../supabase/migrations/033_delivery_ai_receiving.sql',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));

for(const token of ['deliveryScanCamera','deliveryScanGallery','deliveryScanReviewForm','finalizeDeliveryAnalysis','applyDeliveryAiReceiving'])assert.ok(app.includes(token),token);
assert.ok(app.indexOf('await finalizeDeliveryAnalysis')<app.indexOf('applyDeliveryAiReceiving(state',{fromIndex:app.indexOf('await finalizeDeliveryAnalysis')}));
for(const token of ["Capacitor?.Plugins?.Camera","pickImages","delivery-ai-temp","remapro-delivery-ai"])assert.ok(client.includes(token),token);
assert.equal(pkg.dependencies['@capacitor/camera'],'7.0.5');
assert.ok(edge.includes('Deno.env.get("OPENAI_API_KEY")'));
assert.ok(edge.includes('ctx.supabaseAdmin.storage.from(BUCKET).remove(paths)'));
assert.ok(edge.includes('restaurant_workspaces'));
assert.doesNotMatch(client,/OPENAI_API_KEY|sk-[A-Za-z0-9]/);
assert.ok(migration.includes("public=false"));
assert.ok(migration.includes("delivery_ai_temp_update"));
assert.ok(migration.includes("public.is_restaurant_member"));
console.log('Delivery AI receiving checks passed');
