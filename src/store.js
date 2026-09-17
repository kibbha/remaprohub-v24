const KEY='remaprohub.v27.state';
const defaults={revenue:0,covers:0,expenses:0,stock:[],temps:[],suppliers:[],team:[],incidents:[],waste:[],reservations:[],tasks:[['openKitchen',false],['temperatureCheck',false],['diningSetup',false],['cashCheck',false],['closingCleaning',false]],docs:['traceability','nonConformity','recipeSheet','purchaseOrder','inspectionPrep','inventory']};
function clone(v){return JSON.parse(JSON.stringify(v))}
export function load(){try{const raw=JSON.parse(localStorage.getItem(KEY)||'{}');return Object.assign(clone(defaults),raw)}catch{return clone(defaults)}}
export function save(state){localStorage.setItem(KEY,JSON.stringify(state));return state}
export function reset(){localStorage.removeItem(KEY);return clone(defaults)}
export function exportData(state){return JSON.stringify({version:27,exportedAt:new Date().toISOString(),state},null,2)}
