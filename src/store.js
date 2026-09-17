const KEY='remaprohub.v27.state';
const defaults={revenue:0,covers:0,expenses:0,sales:[],stock:[],temps:[],suppliers:[],purchases:[],team:[],shifts:[],incidents:[],waste:[],reservations:[],customers:[],recipes:[],maintenance:[],handover:[],categories:[],tasks:[['openKitchen',false],['temperatureCheck',false],['diningSetup',false],['cashCheck',false],['closingCleaning',false]],docs:['traceability','nonConformity','recipeSheet','purchaseOrder','inspectionPrep','inventory'],preferences:{restaurant:'',currency:'CHF',theme:'taupe'}};
function clone(v){return JSON.parse(JSON.stringify(v))}
function merge(base,raw){const out=Object.assign(clone(base),raw||{});out.preferences=Object.assign({},base.preferences,raw?.preferences||{});for(const k of Object.keys(base))if(Array.isArray(base[k])&&!Array.isArray(out[k]))out[k]=clone(base[k]);return out}
export function load(){try{return merge(defaults,JSON.parse(localStorage.getItem(KEY)||'{}'))}catch{return clone(defaults)}}
export function save(state){localStorage.setItem(KEY,JSON.stringify(state));return state}
export function reset(){localStorage.removeItem(KEY);return clone(defaults)}
export function exportData(state){return JSON.stringify({version:27,exportedAt:new Date().toISOString(),state},null,2)}
