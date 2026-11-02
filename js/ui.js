(function(root){
  'use strict';
  const $=id=>document.getElementById(id), P=root.EFPhysics;
  function quantity(q) {
    if(q===0)return '0 C';const a=Math.abs(q),sign=q>0?'+':'−';
    const units=[[1,'C'],[1e-3,'mC'],[1e-6,'μC'],[1e-9,'nC'],[1e-12,'pC']];
    const unit=units.find(([scale])=>a>=scale);return unit?`${sign}${Number((a/unit[0]).toPrecision(3))} ${unit[1]}`:`${q.toExponential(2)} C`;
  }
  function sci(n){if(!Number.isFinite(n))return '정의되지 않음';if(n===0)return '0';return Math.abs(n)>=.01&&Math.abs(n)<1e4?Number(n.toPrecision(4)).toString():n.toExponential(3);}
  function coord(n){return Math.abs(n)>=1e4||(n!==0&&Math.abs(n)<.001)?n.toExponential(2):n.toFixed(3);}
  let toastTimer;
  function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3400);}
  function refresh(state,callbacks,edit=true) {
    const list=$('charge-list');list.replaceChildren();
    state.charges.forEach(c=>{
      const row=document.createElement('div');row.className=`charge-row ${c.q<0?'negative':c.q===0?'zero':''} ${c.id===state.selected?'selected':''}`;
      const select=document.createElement('button');select.className='row-select';select.style.cssText='display:flex;align-items:center;gap:9px;flex:1;min-width:0;border:0;padding:0;background:transparent;text-align:left';select.setAttribute('aria-label',`전하 ${c.name} 선택`);select.setAttribute('aria-pressed',String(c.id===state.selected));select.title=c.name;
      const sign=document.createElement('span');sign.className='charge-icon';sign.textContent=c.q>0?'+':c.q<0?'−':'0';
      const info=document.createElement('span');info.className='charge-row-info';const title=document.createElement('strong');title.textContent=c.name;title.title=`${c.name} · ${c.q>0?'양전하':c.q<0?'음전하':'중성'}`;const coords=document.createElement('small');coords.textContent=`(${coord(c.x)}, ${coord(c.y)}) m`;info.append(title,coords);
      const value=document.createElement('span');value.className='q-value';value.textContent=quantity(c.q);select.append(sign,info,value);select.onclick=()=>callbacks.select(c.id);
      const del=document.createElement('button');del.className='row-delete';del.textContent='×';del.setAttribute('aria-label',`전하 ${c.name} 삭제`);del.onclick=()=>callbacks.remove(c.id);row.append(select,del);list.append(row);
    });
    const selected=state.charges.find(c=>c.id===state.selected);
    $('charge-fields').disabled=!selected;$('selected-badge').textContent=selected?selected.name:'선택 없음';$('selected-badge').title=selected?.name||'';$('charge-count').textContent=`${state.charges.length}개`;
    if(edit){$('edit-error').textContent='';for(const [id,key]of [['charge-name','name'],['charge-q','q'],['charge-x','x'],['charge-y','y']])$(id).value=selected?String(selected[key]):'';}
    $('empty-state').hidden=state.charges.length>0;$('clear-btn').disabled=!state.charges.length;
  }
  function settings(state){
    for(const [id,key,format] of [['line-density','lineDensity',n=>String(n)],['arrow-density','arrowDensity',n=>n.toFixed(1)+'×'],['line-width','lineWidth',n=>n.toFixed(1)+' px'],['arrow-size','arrowSize',n=>n+' px']]){$(id).value=state.settings[key];$(id+'-value').textContent=format(state.settings[key]);}
    for(const id of ['show-arrows','field-arrows'])$(id).checked=state.settings.showArrows;
    for(const id of ['show-grid','field-grid'])$(id).checked=state.settings.showGrid;
    $('show-field-controls').checked=state.settings.showFieldControls;
    $('field-controls').hidden=!state.settings.showFieldControls;
  }
  function probe(pointer,state) {
    if(!pointer.inside){$('probe-mag').replaceChildren(document.createTextNode('—'));const small=document.createElement('small');small.textContent='마우스를 올려 측정';$('probe-mag').append(small);for(const id of ['probe-ex','probe-ey','probe-angle'])$(id).textContent='—';$('probe-position').textContent='x — m · y — m';return;}
    const {x,y}=pointer.world,e=P.fieldAt(x,y,state.charges);$('cursor-position').textContent=`x ${coord(x)} m   y ${coord(y)} m`;
    $('probe-position').textContent=`x ${coord(x)} m · y ${coord(y)} m`;
    $('probe-mag').textContent=e.singular?'특이점':sci(e.magnitude);const unit=document.createElement('small');unit.textContent=e.singular?'점전하 중심 · 전기장 정의되지 않음':'합성 전기장 크기 |E| · N/C';$('probe-mag').append(unit);
    $('probe-ex').textContent=sci(e.x);$('probe-ey').textContent=sci(e.y);$('probe-angle').textContent=e.singular||(!e.dx&&!e.dy)?'—':`${((Math.atan2(e.dy,e.dx)*180/Math.PI+360)%360).toFixed(1)}°`;
  }
  function bind(state,app) {
    document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>app.setMode(b.dataset.mode));
    $('preset').onchange=()=>app.preset($('preset').value);
    $('charge-form').onsubmit=e=>{e.preventDefault();try {const name=P.validateName($('charge-name').value,state.charges,state.selected),q=P.parseNumber($('charge-q').value,P.LIMITS.charge,'전하량'),x=P.parseNumber($('charge-x').value,P.LIMITS.coordinate,'X'),y=P.parseNumber($('charge-y').value,P.LIMITS.coordinate,'Y');app.edit({name,q,x,y});}catch(err){$('edit-error').textContent=err.message;}};
    document.querySelectorAll('[data-q]').forEach(b=>b.onclick=()=>app.edit({q:Number(b.dataset.q)}));document.querySelector('[data-flip]').onclick=()=>{const c=state.charges.find(c=>c.id===state.selected);if(c)app.edit({q:-c.q});};
    $('delete-btn').onclick=()=>app.remove(state.selected);$('clear-btn').onclick=()=>$('clear-dialog').showModal();
    $('cancel-clear').onclick=()=>$('clear-dialog').close();$('confirm-clear').onclick=()=>{$('clear-dialog').close();app.clear();};
    for(const [id,key]of [['line-density','lineDensity'],['arrow-density','arrowDensity'],['line-width','lineWidth'],['arrow-size','arrowSize']])$(id).oninput=()=>{state.settings[key]=Number($(id).value);settings(state);app.settingChanged(key);};
    for(const [id,key]of [['show-arrows','showArrows'],['field-arrows','showArrows'],['show-grid','showGrid'],['field-grid','showGrid'],['show-field-controls','showFieldControls']])$(id).onchange=()=>{state.settings[key]=$(id).checked;settings(state);app.settingChanged(key);};
    $('maximize-btn').onclick=()=>app.maximize(!state.maximized);
    $('settings-reset').onclick=()=>{state.settings={...P.DEFAULTS};settings(state);app.settingChanged('lineDensity');};
    $('zoom-in').onclick=()=>app.zoom(1.25);$('zoom-out').onclick=()=>app.zoom(.8);$('reset-view').onclick=app.resetView;$('fit-btn').onclick=app.fit;
    $('save-btn').onclick=app.save;$('import-btn').onclick=()=>$('import-file').click();$('import-file').onchange=async()=>{const file=$('import-file').files[0];try{if(file){if(file.size>2*1024*1024)throw new Error('JSON 파일은 2 MB 이하여야 합니다.');app.load(JSON.parse(await file.text()));}}catch(err){toast('불러오기 실패: '+err.message);}finally{$('import-file').value='';}};
    $('png-btn').onclick=app.png;$('help-btn').onclick=()=>$('help-dialog').showModal();$('close-help').onclick=()=>$('help-dialog').close();$('help-dialog').onclick=e=>{if(e.target===$('help-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}};
    document.addEventListener('keydown',e=>{
      if(e.key==='Escape'&&state.maximized&&!$('help-dialog').open&&!$('clear-dialog').open){e.preventDefault();app.maximize(false);return;}
      if(e.target.closest('input,textarea,select,button,[contenteditable=true]')||e.ctrlKey||e.metaKey||e.altKey||$('help-dialog').open||$('clear-dialog').open)return;
      if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();app.remove(state.selected);}
      if(e.key.toLowerCase()==='v'||e.key==='Escape')app.setMode('select');if(e.key.toLowerCase()==='h')app.setMode('pan');
      if(e.key==='+'||e.key==='=')app.setMode('positive');if(e.key==='-'||e.key==='_')app.setMode('negative');if(e.key.toLowerCase()==='f')app.fit();
      if(e.code==='Space'){e.preventDefault();app.space(true);}
    });
    document.addEventListener('keyup',e=>{if(e.code==='Space')app.space(false);});window.addEventListener('blur',()=>app.space(false));settings(state);
  }
  root.EFUI={$,quantity,sci,coord,toast,refresh,settings,probe,bind};
})(globalThis);
