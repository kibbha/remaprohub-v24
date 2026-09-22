import {t} from './i18n.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let toastTimer=null;
export function uiAlert(message,{tone='info',timeout=3600}={}){
  let host=document.getElementById('pos-toast-host');if(!host){host=document.createElement('div');host.id='pos-toast-host';host.className='pos-toast-host';host.setAttribute('aria-live','polite');document.body.appendChild(host)}
  const node=document.createElement('div');node.className='pos-toast '+tone;node.textContent=String(message||'');host.appendChild(node);
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.remove(),timeout);return false;
}
function mountModal({title='',message='',fields=[],confirmLabel=t('confirm'),cancelLabel=t('cancel'),danger=false}={}){
  return new Promise(resolve=>{
    const overlay=document.createElement('div');overlay.className='modal-overlay pos-ui-overlay';overlay.setAttribute('role','presentation');
    const controls=fields.map((f,i)=>{
      const id='pos-ui-'+i+'-'+Date.now();
      if(f.type==='select')return `<label class="field" for="${id}"><span>${esc(f.label||'')}</span><select id="${id}" name="${esc(f.name)}">${(f.options||[]).map(o=>`<option value="${esc(o.value)}" ${String(o.value)===String(f.value??'')?'selected':''}>${esc(o.label)}</option>`).join('')}</select></label>`;
      return `<label class="field" for="${id}"><span>${esc(f.label||'')}</span><input id="${id}" name="${esc(f.name)}" type="${esc(f.type||'text')}" inputmode="${esc(f.inputMode||'text')}" value="${esc(f.value??'')}" ${f.min!=null?'min="'+esc(f.min)+'"':''} ${f.max!=null?'max="'+esc(f.max)+'"':''} ${f.step!=null?'step="'+esc(f.step)+'"':''} ${f.required?'required':''}></label>`;
    }).join('');
    overlay.innerHTML=`<section class="pos-ui-dialog" role="dialog" aria-modal="true"><header><h2>${esc(title)}</h2></header>${message?'<p class="pos-ui-message">'+esc(message)+'</p>':''}<form class="pos-ui-form">${controls}<div class="pos-ui-actions"><button type="button" class="secondary" data-ui-cancel>${esc(cancelLabel)}</button><button class="${danger?'danger':'primary'}" data-ui-confirm>${esc(confirmLabel)}</button></div></form></section>`;
    document.body.appendChild(overlay);document.body.classList.add('modal-open');
    const form=overlay.querySelector('form'),first=form.querySelector('input,select,button');setTimeout(()=>first?.focus(),0);
    const finish=value=>{overlay.remove();if(!document.querySelector('.modal-overlay'))document.body.classList.remove('modal-open');resolve(value)};
    overlay.addEventListener('click',e=>{if(e.target===overlay)finish(null)});
    overlay.querySelector('[data-ui-cancel]')?.addEventListener('click',()=>finish(null));
    form.addEventListener('submit',e=>{e.preventDefault();const data=new FormData(form),out={};for(const f of fields)out[f.name]=data.get(f.name);finish(out)});
    overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();finish(null)}});
  });
}
export async function uiConfirm({title='',message='',confirmLabel=t('confirm'),cancelLabel=t('cancel'),danger=false}={}){
  const value=await mountModal({title,message,confirmLabel,cancelLabel,danger});return value!==null;
}
export async function uiPrompt({title='',message='',label='',value='',name='value',type='text',inputMode='text',required=false,min,max,step}={}){
  const result=await mountModal({title,message,fields:[{name,label,value,type,inputMode,required,min,max,step}]});return result?String(result[name]??''):null;
}
export async function uiFields({title='',message='',fields=[],confirmLabel=t('confirm'),cancelLabel=t('cancel'),danger=false}={}){
  return mountModal({title,message,fields,confirmLabel,cancelLabel,danger});
}
