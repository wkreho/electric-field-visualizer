(function(){
  'use strict';
  const P=EFPhysics,S=EFSimulation,E=EFEditing,U=EFUI,$=U.$,canvas=$('field-canvas'),renderer=new EFSimulationRenderer(canvas),engine=new S.Engine();
  const state={engine,view:{x:0,y:0,scale:120},selected:null,selection:[],probe:null,preset:'',mode:'select',maximized:false};
  const pointer={inside:false,x:0,y:0,world:{x:0,y:0}};
  const SESSION='fieldwork.dynamic.session.v1';
  let worker=null,fieldBusy=false,fieldPending=null,epoch=0,lastFieldAt=-Infinity,fieldSceneTime=0,lastUI=0,lastProbe=0,accumulator=0,lastFrame=performance.now(),drag=null,space=false,activePointer=null,referenceScale=120,energyReference={kinetic:0,potential:0,total:0},animation=0,disposed=false,slow=false;
  const toggles={showFieldLines:['sim-lines','overlay-lines'],showArrows:['sim-arrows','overlay-arrows'],showTrails:['sim-trails'],showVelocity:['sim-velocity'],showForces:['sim-forces'],showGrid:['sim-grid','overlay-grid'],showFieldControls:['sim-controls'],preserveXAxisSymmetry:['sim-symmetry']};
  const selected=()=>engine.bodies.find(b=>b.id===state.selected);
  const H=EFEditHistory,history=new H.History(150,renderHistory);
  const snapshot=()=>H.capture(engine,{selected:state.selected,selection:state.selection,preset:state.preset});
  function renderHistory(){for(const [action,stack]of [['undo',history.undoStack],['redo',history.redoStack]]){const button=$('edit-'+action);button.disabled=!stack.length;button.dataset.historyCount=stack.length;button.title=(action==='undo'?'Undo (Ctrl+Z)':'Redo (Ctrl+Y / Ctrl+Shift+Z)')+(stack.length?' · '+stack[stack.length-1].label:'');}}
  function edit(label,apply){finishDrag();pause();const before=snapshot();apply();history.record(label,before,snapshot());}
  function restoreEdit(data){const meta=H.restore(engine,data,state.view);setSelection(meta.selection);accumulator=0;energyReference=S.energy(engine.initial,engine.settings.quality);state.preset=meta.preset;$('sim-preset').value=meta.preset;$('preset-description').textContent=S.PRESETS[meta.preset]?.description||'';warning();renderList();renderProperties();renderSettings();renderStats();invalidate();updateProbe();}
  function travelHistory(action){finishDrag();pause();try{if(history[action](restoreEdit))U.toast(action==='undo'?'편집을 되돌렸습니다.':'편집을 다시 적용했습니다.');}catch(error){warning(error.message);}}

  function warning(message=''){$('sim-warning').textContent=message;$('sim-warning').hidden=!message;}
  function pause(){const wasRunning=engine.status==='running';engine.pause();accumulator=0;if(wasRunning)renderProperties();renderTransport();}
  function invalidate(){epoch++;renderer.data={lines:[],logMin:0,logMax:1};renderer.background(state);lastFieldAt=-Infinity;$('field-snapshot').textContent=engine.settings.showFieldLines?'Field 계산 중':'Field OFF';if(engine.settings.showFieldLines)requestField(true);else{fieldPending=null;$('sim-field-status').textContent='전기력선 숨김';}}
  function checkFieldBudget(bodies,quality){if(S.samples(bodies,quality).length>512)throw new Error('Field 샘플은 최대 512개입니다. Field 품질이나 물체 수를 낮추세요.');}
  function commit(bodies,structural=true){
    const normalized=S.validateBodies(bodies);checkFieldBudget(normalized,engine.settings.fieldQuality);engine.replace(normalized);accumulator=0;energyReference=S.energy(engine.initial,engine.settings.quality);state.preset='';$('sim-preset').selectedIndex=-1;$('preset-description').textContent='';warning();
    if(structural){renderList();renderSettings();}renderProperties();renderTransport();renderStats();invalidate();
  }
  function nextId(){const used=new Set(engine.bodies.map(b=>b.id));let id=1;while(used.has(id))id++;return id;}
  function add(type,x,y){
    pause();try{const b=S.body(nextId(),P.nextChargeName(engine.bodies),type,1e-9,x,y,type!=='point',type==='point'?0:.65);const bodies=[...S.clone(engine.bodies),b];edit('Add '+type,()=>{commit(bodies);setSelection([b.id]);renderList();renderProperties();});setMode('select');U.toast('전하를 추가했습니다. 속성에서 Fixed / Free와 초기 속도를 설정하세요.');}catch(error){warning(error.message);}
  }
  let clipboard=[],pasteSerial=0,dismissedProbeTarget=null;
  function setSelection(ids){state.selection=E.selection(engine.bodies,ids);state.selected=state.selection.length===1?state.selection[0]:null;}
  function select(id,toggle=false){setSelection(toggle?E.toggle(state.selection,id):[id]);renderList();renderProperties();renderStats();}
  function remove(){if(!state.selection.length)return;const ids=[...state.selection];try{edit('Delete '+ids.length+' charge(s)',()=>{commit(engine.bodies.filter(b=>!ids.includes(b.id)));setSelection([]);renderList();renderProperties();});}catch(error){warning(error.message);}}
  function copySelection(){if(!state.selection.length)return;clipboard=E.copy(engine.bodies,state.selection,engine.initial);pasteSerial=0;renderSelection();U.toast(clipboard.length+'개 전하를 복사했습니다.');}
  function pasteSelection(){if(!clipboard.length)return;try{finishDrag();pause();const plan=E.planPaste(clipboard,engine.bodies,engine.settings,pointer.inside?pointer.world:null,pasteSerial);edit('Paste '+plan.ids.length+' charge(s)',()=>{commit(plan.bodies);setSelection(plan.ids);renderList();renderProperties();});pasteSerial=plan.nextSerial;setMode('select');U.toast(plan.ids.length+'개 전하를 붙여넣었습니다.');}catch(error){warning(error.message);}}
  function renderSelection(){const names=engine.bodies.filter(b=>state.selection.includes(b.id)).map(b=>b.name);$('body-list').dataset.selectionCount=names.length;$('selection-summary').hidden=names.length<2;$('selection-summary').textContent=names.length+' charges selected · '+names.join(', ')+' · 드래그·복사·삭제를 그룹에 적용합니다.';$('selection-copy').disabled=!names.length;$('selection-delete').disabled=!names.length;$('selection-paste').disabled=!clipboard.length;}
  function setMode(mode){if(mode==='probe')closeProbe();state.mode=mode;document.querySelectorAll('[data-sim-mode]').forEach(b=>{b.classList.toggle('active',b.dataset.simMode===mode);b.setAttribute('aria-pressed',String(b.dataset.simMode===mode));});document.querySelectorAll('[data-add]').forEach(b=>b.classList.toggle('active',mode==='add-'+b.dataset.add));$('field-add').classList.toggle('active',mode.startsWith('add-'));canvas.style.cursor=space||mode==='pan'?'grab':mode==='select'?'default':'crosshair';$('sim-mode-label').textContent=mode.startsWith('add-')?`${mode.slice(4)} 추가 · 평면 클릭`:mode==='pan'?'화면 이동':mode==='probe'?'Probe · 측정 지점 클릭':'선택';}
  function renderList(){
    const list=$('body-list');list.replaceChildren();
    for(const b of engine.bodies){const button=document.createElement('button');button.type='button';button.className='body-row'+(state.selection.includes(b.id)?' active':'');button.dataset.id=b.id;button.setAttribute('aria-label',`${b.name} 선택`);button.setAttribute('aria-pressed',String(state.selection.includes(b.id)));button.title=b.name;
      const sign=document.createElement('span');sign.className='body-sign';sign.style.color=b.q>0?'#fa7b80':b.q<0?'#77adff':'#a6b4c4';sign.textContent=b.type==='ring'?'◎':b.type==='disk'?'●':b.q>0?'⊕':b.q<0?'⊖':'○';
      const info=document.createElement('span');info.className='body-info';const name=document.createElement('strong');name.textContent=b.name;const coords=document.createElement('small');coords.textContent=`${U.coord(b.x)}, ${U.coord(b.y)} m`;info.append(name,coords);
      const kind=document.createElement('span');kind.className='body-kind';kind.textContent=`${b.type.toUpperCase()} · ${b.fixed?'FIXED':'FREE'}`;button.append(sign,info,kind);button.onclick=e=>select(b.id,e.shiftKey);list.append(button);
    }
    $('body-count').textContent=`${engine.bodies.length} / 16`;$('sim-empty').hidden=engine.bodies.length>0;$('reset-all').disabled=!engine.bodies.length;renderSelection();
  }
  function formShape(){const type=$('body-type').value,free=$('body-fixed').value==='free';$('radius-property').hidden=type==='point';for(const id of ['body-mass','body-vx','body-vy'])$(id).disabled=!free;if(type!=='point'&&!(Number($('body-radius').value)>0))$('body-radius').value='.65';}
  function renderProperties(){const b=selected();$('body-form').hidden=state.selection.length>1;$('property-fields').disabled=!b;$('body-selection').textContent=state.selection.length>1?state.selection.length+' selected':b?.name||'선택 없음';renderSelection();$('body-selection').title=engine.bodies.filter(b=>state.selection.includes(b.id)).map(b=>b.name).join(', ');$('body-error').textContent='';
    for(const [id,key]of [['body-name','name'],['body-type','type'],['body-q','q'],['body-x','x'],['body-y','y'],['body-radius','radius'],['body-mass','mass'],['body-vx','vx'],['body-vy','vy']])$(id).value=b?String(b[key]):'';
    $('body-fixed').value=b?.fixed?'fixed':'free';formShape();
    if(b?.type==='ring')$('body-density').textContent=`λ ${U.sci(b.q/(2*Math.PI*b.radius))} C/m`;
    else if(b?.type==='disk')$('body-density').textContent=`σ ${U.sci(b.q/(Math.PI*b.radius*b.radius))} C/m²`;
    else $('body-density').textContent='점전하';
  }
  function renderSettings(){const settings=engine.settings;for(const [key,ids]of Object.entries(toggles))for(const id of ids)$(id).checked=settings[key];
    for(const [id,key]of [['sim-dt','dt'],['collision-radius','collisionRadius'],['sim-speed','speed'],['force-quality','quality'],['field-quality','fieldQuality'],['sim-line-density','lineDensity'],['field-interval','fieldInterval'],['sim-arrow-density','arrowDensity'],['sim-line-width','lineWidth'],['sim-arrow-size','arrowSize']])$(id).value=settings[key];
    $('sim-speed-value').textContent=settings.speed.toFixed(1)+'×';$('sim-line-density-value').textContent=settings.lineDensity;$('field-interval-value').textContent=settings.fieldInterval+' ms';
    for(const [id,key]of [['sim-arrow-density','arrowDensity'],['sim-line-width','lineWidth'],['sim-arrow-size','arrowSize']])$(id+'-value').textContent=settings[key];$('sim-overlay-controls').hidden=!settings.showFieldControls;
    $('sample-info').textContent=`힘 ${S.samples(engine.bodies,settings.quality).length} / Field ${S.samples(engine.bodies,settings.fieldQuality).length}개 샘플 · 쌍 ${S.workCount(engine.bodies,settings.quality).toLocaleString()}개`;
  }
  function renderTransport(){const running=engine.status==='running',paused=engine.status==='paused';$('sim-start').disabled=running||!engine.bodies.length;$('sim-pause').disabled=!running&&!paused;$('sim-pause').textContent=paused?'▶ Resume':'Ⅱ Pause';$('sim-reset').disabled=!engine.bodies.length;$('sim-time').textContent=engine.time.toFixed(3)+' s';$('sim-status').dataset.state=engine.status;$('sim-status').textContent=running?(slow?'실행 · 계산 부하':'실행 중'):paused?'일시정지':'준비';const symmetry=engine.symmetry;$('symmetry-status').textContent=symmetry.reason;$('symmetry-status').dataset.active=String(symmetry.active);}
  function renderStats(){
    for(const row of $('body-list').children){const b=engine.bodies.find(v=>v.id===Number(row.dataset.id));if(b)row.querySelector('small').textContent=`${U.coord(b.x)}, ${U.coord(b.y)} m`;}
    const b=selected(),index=engine.bodies.findIndex(v=>v.id===state.selected),f=engine.forces[index];$('body-speed').textContent=b?U.sci(Math.hypot(b.vx,b.vy)):'—';$('body-force').textContent=b&&!b.fixed&&f?U.sci(Math.hypot(f.x,f.y)):'—';
    const energy=S.energy(engine.bodies,engine.settings.quality),denom=energyReference.kinetic+Math.abs(energyReference.potential);$('energy-error').textContent=denom?((energy.total-energyReference.total)/denom*100).toFixed(4)+'%':'0.0000%';
    renderTransport();
  }
  function closeProbe(){state.probe=null;$('field-probe').hidden=true;$('probe-error').textContent='';}
  function placeProbe(x,y){try{const point=E.probe(x,y,engine.bodies,engine.settings.quality);state.probe={x:point.x,y:point.y};$('probe-x').value=String(point.x);$('probe-y').value=String(point.y);$('probe-error').textContent='';$('field-probe').hidden=false;updateProbe();}catch(error){$('probe-error').textContent=error.message;}}
  function positionProbe(){
    if(!state.probe)return;
    const point=renderer.project(state.probe.x,state.probe.y,state.view),panel=$('field-probe'),w=panel.offsetWidth,h=panel.offsetHeight,box=canvas.getBoundingClientRect();
    const obstacles=[...document.querySelectorAll('.sim-topbar,.sim-field-controls,.sim-energy,.sim-view-controls')].filter(e=>e.offsetWidth).map(e=>{const r=e.getBoundingClientRect();return {x:r.left-box.left,y:r.top-box.top,w:r.width,h:r.height,weight:100};});
    for(const body of engine.bodies){const c=renderer.project(body.x,body.y,state.view);obstacles.push({x:c.x-20,y:c.y-20,w:40,h:40,weight:1});}
    const overlap=(r,o)=>Math.max(0,Math.min(r.x+w,o.x+o.w)-Math.max(r.x,o.x))*Math.max(0,Math.min(r.y+h,o.y+o.h)-Math.max(r.y,o.y));
    const candidates=[{x:point.x-w/2,y:point.y-h-14},{x:point.x-w/2,y:point.y+16},{x:point.x+16,y:point.y-h/2},{x:point.x-w-16,y:point.y-h/2}].map((r,i)=>{r.x=Math.max(8,Math.min(renderer.width-w-8,r.x));r.y=Math.max(8,Math.min(renderer.height-h-8,r.y));return {...r,score:obstacles.reduce((sum,o)=>sum+overlap(r,o)*o.weight,0)+i};});
    candidates.sort((a,b)=>a.score-b.score);panel.style.left=candidates[0].x+'px';panel.style.top=candidates[0].y+'px';
  }
  function updateProbe(){if(!state.probe)return;const value=E.probe(state.probe.x,state.probe.y,engine.bodies,engine.settings.quality);$('sim-probe-mag').textContent=value.singular?'정의되지 않음':U.sci(value.magnitude);$('sim-probe-ex').textContent=value.singular?'—':U.sci(value.ex);$('sim-probe-ey').textContent=value.singular?'—':U.sci(value.ey);$('sim-probe-angle').textContent=value.direction===null?'—':value.direction.toFixed(2)+'°';$('sim-probe-note').textContent=value.singular?'전하/샘플 중심의 특이점입니다.':engine.bodies.some(b=>b.type==='disk'&&Math.hypot(value.x-b.x,value.y-b.y)<b.radius)?'분포 내부: 이산 샘플 근사값':'';positionProbe();}
  function applySetting(key,value){try{checkFieldBudget(engine.bodies,key==='fieldQuality'?value:engine.settings.fieldQuality);engine.configure({[key]:value});if(key==='quality'){pause();energyReference=S.energy(engine.initial,engine.settings.quality);}if(key==='dt'||key==='collisionRadius')pause();warning();renderSettings();if(['fieldQuality','lineDensity','arrowDensity','lineWidth','arrowSize','showFieldLines'].includes(key))invalidate();else renderer.background(state);}catch(error){warning(error.message);renderSettings();}}
  function requestField(force=false){const now=performance.now();if(!engine.settings.showFieldLines)return;if(!force&&now-lastFieldAt<engine.settings.fieldInterval)return;lastFieldAt=now;
    fieldPending={epoch,time:engine.time,scene:{bodies:S.clone(engine.bodies),view:{...state.view},width:renderer.width,height:renderer.height,settings:{...engine.settings}}};dispatchField();
  }
  function dispatchField(){if(fieldBusy||!fieldPending)return;const job=fieldPending;fieldPending=null;fieldBusy=true;$('sim-field-status').textContent='전기력선 계산 중';
    if(worker)worker.postMessage(job);else setTimeout(()=>{try{receiveField({epoch:job.epoch,time:job.time,result:EFSimulationFields.generate(job.scene)});}catch(error){receiveField({epoch:job.epoch,error:error.message});}},0);
  }
  function receiveField(data){fieldBusy=false;if(data.epoch===epoch){if(data.error){$('sim-field-status').textContent='Field 계산 제한';$('field-snapshot').textContent='Field 계산 제한';warning(data.error);}else{renderer.data=data.result;fieldSceneTime=data.time;renderer.background(state);$('sim-field-status').textContent=`${data.result.lines.length} lines · ${Math.round(data.result.ms)} ms`;$('field-snapshot').textContent=`Field 배치 t=${data.time.toFixed(3)} s`;}}dispatchField();}
  try{if(location.protocol!=='file:'){worker=new Worker('js/simulation-worker.js');worker.onmessage=e=>receiveField(e.data);worker.onerror=()=>{worker.terminate();worker=null;fieldBusy=false;warning('Field 계산을 기본 모드로 전환했습니다. 원활한 조작을 위해 낮은 Field 품질을 권장합니다.');requestField(true);};}}catch{worker=null;}
  function viewChanged(){state.view.x=Math.max(-1e6,Math.min(1e6,state.view.x));state.view.y=Math.max(-1e6,Math.min(1e6,state.view.y));const percent=state.view.scale/referenceScale*100;$('sim-zoom').textContent=(percent<1?percent.toPrecision(2):Math.round(percent))+'%';if(pointer.inside)pointer.world=P.screenToWorld(pointer.x,pointer.y,state.view,renderer.width,renderer.height);renderer.background(state);positionProbe();requestField(true);}
  function zoom(factor,x=renderer.width/2,y=renderer.height/2){state.view=P.zoomAt(state.view,factor,x,y,renderer.width,renderer.height);viewChanged();}
  function resetView(){referenceScale=Math.max(30,Math.min(140,renderer.width/7,renderer.height/5.5));state.view={x:0,y:0,scale:referenceScale};viewChanged();}
  function fit(){if(!engine.bodies.length){resetView();return;}const left=Math.min(...engine.bodies.map(b=>b.x-b.radius)),right=Math.max(...engine.bodies.map(b=>b.x+b.radius)),top=Math.max(...engine.bodies.map(b=>b.y+b.radius)),bottom=Math.min(...engine.bodies.map(b=>b.y-b.radius));state.view={x:(left+right)/2,y:(top+bottom)/2,scale:Math.max(1e-9,Math.min(1e6,Math.max(100,renderer.width-150)/Math.max(4,right-left),Math.max(100,renderer.height-200)/Math.max(3.5,top-bottom)))};viewChanged();}
  function maximize(active){finishDrag();state.maximized=active;space=false;pointer.inside=false;if(activePointer!==null&&canvas.hasPointerCapture(activePointer))canvas.releasePointerCapture(activePointer);activePointer=null;document.body.classList.toggle('field-maximized',active);$('sim-maximize').setAttribute('aria-pressed',String(active));$('sim-maximize').setAttribute('aria-label',active?'필드 복원':'필드 최대화');$('sim-maximize').title=active?'필드 복원 (Esc)':'필드 최대화';$('sim-maximize-icon').setAttribute('d',active?'M9 3h12v12M3 9h12v12H3z':'M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5');updateProbe();requestAnimationFrame(()=>(active?canvas:$('sim-maximize')).focus({preventScroll:true}));}
  function preset(key){pause();const p=S.PRESETS[key];engine.replace(p.bodies);setSelection([engine.bodies.find(b=>!b.fixed)?.id??engine.bodies[0]?.id].filter(Number.isSafeInteger));accumulator=0;energyReference=S.energy(engine.initial,engine.settings.quality);state.preset=key;$('sim-preset').value=key;$('preset-description').textContent=p.description;setMode('select');warning();renderList();renderProperties();renderSettings();renderStats();resetView();invalidate();}
  function load(data,silent=false){const valid=S.validateScene(data);checkFieldBudget(valid.bodies,valid.settings.fieldQuality);engine.restore(valid);state.view=valid.view;setSelection(engine.bodies.length?[engine.bodies[0].id]:[]);energyReference=S.energy(engine.initial,engine.settings.quality);accumulator=0;state.preset='';$('sim-preset').selectedIndex=-1;$('preset-description').textContent='';warning();renderList();renderProperties();renderSettings();renderStats();setMode('select');viewChanged();invalidate();if(!silent)U.toast('시뮬레이션 배치를 불러왔습니다. 실행은 일시정지 상태입니다.');}
  function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
  function save(){download(new Blob([JSON.stringify(S.serialize(engine,state.view),null,2)],{type:'application/json'}),'fieldwork-simulation.json');U.toast('현재 상태와 초기조건을 저장했습니다.');}
  function saveSession(){try{sessionStorage.setItem(SESSION,JSON.stringify({scene:S.serialize(engine,state.view),referenceScale,selected:state.selected,selection:state.selection,preset:$('sim-preset').value}));}catch{/* Storage may be unavailable for local files or private browsing. */}}
  $('sim-start').onclick=()=>{try{engine.reset();renderProperties();energyReference=S.energy(engine.initial,engine.settings.quality);engine.start();accumulator=0;warning();invalidate();renderTransport();}catch(error){warning(error.message);}};
  $('sim-pause').onclick=()=>{if(engine.status==='running'){pause();requestField(true);}else{try{engine.start();accumulator=0;warning();renderTransport();}catch(error){warning(error.message);}}};
  $('sim-reset').onclick=()=>{engine.reset();accumulator=0;warning();renderProperties();renderStats();invalidate();};
  $('reset-all').onclick=()=>{pause();$('sim-clear-dialog').showModal();};$('sim-clear-cancel').onclick=()=>$('sim-clear-dialog').close();$('sim-clear-confirm').onclick=()=>{$('sim-clear-dialog').close();edit('Clear all',()=>{setSelection([]);commit([]);renderSettings();});};
  $('sim-preset').onchange=()=>{try{const key=$('sim-preset').value;edit('Apply preset',()=>preset(key));}catch(error){warning(error.message);}};
  document.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>{pause();$('field-add-type').value=b.dataset.add;setMode('add-'+b.dataset.add);});document.querySelectorAll('[data-sim-mode]').forEach(b=>b.onclick=()=>{finishDrag();setMode(b.dataset.simMode);});$('field-add').onclick=()=>{pause();setMode('add-'+$('field-add-type').value);};$('field-add-type').onchange=()=>{pause();setMode('add-'+$('field-add-type').value);};
  $('edit-undo').onclick=()=>travelHistory('undo');$('edit-redo').onclick=()=>travelHistory('redo');renderHistory();
  document.querySelectorAll('[data-q]').forEach(b=>b.onclick=()=>{$('body-q').value=b.dataset.q;$('body-form').requestSubmit();});$('body-flip').onclick=()=>{const q=Number($('body-q').value);if(Number.isFinite(q)){$('body-q').value=-q;$('body-form').requestSubmit();}};
  // Also support the browser Edit menu and native clipboard events.
  document.addEventListener('copy',e=>{if(e.defaultPrevented||E.textEditing(e.target)||E.textEditing(document.activeElement)||!state.selection.length)return;e.preventDefault();copySelection();e.clipboardData?.setData('text/plain','FIELDWORK: '+clipboard.length+' charge(s)');});
  document.addEventListener('paste',e=>{if(e.defaultPrevented||E.textEditing(e.target)||E.textEditing(document.activeElement)||!clipboard.length)return;e.preventDefault();pasteSelection();});
  $('selection-copy').onclick=copySelection;$('selection-paste').onclick=pasteSelection;$('selection-delete').onclick=remove;
  $('probe-close').onclick=closeProbe;$('probe-form').onsubmit=e=>{e.preventDefault();placeProbe($('probe-x').value,$('probe-y').value);};
  document.addEventListener('pointerdown',e=>{if(!state.probe||$('field-probe').contains(e.target)||e.target===canvas||e.target.closest('.sim-view-controls,.sim-transport,.sim-mode-tools'))return;dismissedProbeTarget=e.target;closeProbe();e.preventDefault();e.stopPropagation();},true);
  document.addEventListener('click',e=>{const target=dismissedProbeTarget;dismissedProbeTarget=null;if(target&&(target===e.target||target.contains(e.target))){e.preventDefault();e.stopPropagation();}},true);
  $('body-type').onchange=formShape;$('body-fixed').onchange=formShape;$('body-delete').onclick=remove;
  $('property-fields').addEventListener('focusin',()=>{if(engine.status==='running'){pause();renderProperties();requestField(true);}});
  $('body-form').onsubmit=e=>{e.preventDefault();const current=selected();if(!current)return;pause();try{const b={id:current.id,name:P.validateName($('body-name').value,engine.bodies,current.id),type:$('body-type').value,fixed:$('body-fixed').value==='fixed',q:$('body-q').value,x:$('body-x').value,y:$('body-y').value,radius:$('body-radius').value,mass:$('body-mass').value,vx:$('body-vx').value,vy:$('body-vy').value};const bodies=engine.bodies.map(v=>v.id===b.id?b:{...v});edit('Edit charge properties',()=>{commit(bodies);renderSettings();});U.toast('현재 배치를 새 초기조건으로 적용했습니다.');}catch(error){$('body-error').textContent=error.message;}};
  for(const [key,ids]of Object.entries(toggles))for(const id of ids)$(id).onchange=()=>applySetting(key,$(id).checked);
  for(const [id,key]of [['sim-dt','dt'],['collision-radius','collisionRadius']]){const apply=()=>applySetting(key,Number($(id).value.trim()||NaN));$(id).onchange=apply;$(id).onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();apply();}};}
  for(const [id,key]of [['force-quality','quality'],['field-quality','fieldQuality']])$(id).onchange=()=>applySetting(key,$(id).value);
  for(const [id,key]of [['sim-speed','speed'],['sim-line-density','lineDensity'],['field-interval','fieldInterval'],['sim-arrow-density','arrowDensity'],['sim-line-width','lineWidth'],['sim-arrow-size','arrowSize']])$(id).oninput=()=>applySetting(key,Number($(id).value));
  $('clear-trails').onclick=()=>engine.clearTrails();$('sim-zoom-in').onclick=()=>zoom(1.25);$('sim-zoom-out').onclick=()=>zoom(.8);$('sim-fit').onclick=fit;$('sim-view-reset').onclick=resetView;$('sim-maximize').onclick=()=>maximize(!state.maximized);$('sim-save').onclick=save;
  $('sim-import').onclick=()=>$('sim-file').click();$('sim-file').onchange=async()=>{const file=$('sim-file').files[0];try{if(file){if(file.size>2*1024*1024)throw new Error('JSON 파일은 2 MB 이하여야 합니다.');const data=JSON.parse(await file.text());edit('Import JSON',()=>load(data));}}catch(error){warning('불러오기 실패: '+error.message);}finally{$('sim-file').value='';}};
  $('sim-png').onclick=()=>{renderer.drawScene(state,null);canvas.toBlob(blob=>{if(blob){download(blob,'fieldwork-simulation.png');U.toast('현재 시뮬레이션 화면을 저장했습니다.');}},'image/png');};
  document.addEventListener('keydown',e=>{
    if($('sim-clear-dialog').open)return;
    if(e.key==='Escape'){e.preventDefault();if(drag?.kind==='body'&&history.pending){const before=history.pending.before;history.cancel();drag=null;finishDrag();restoreEdit(before);}else finishDrag();closeProbe();setSelection([]);renderList();renderProperties();setMode('select');if(state.maximized)maximize(false);return;}
    const action=H.shortcut(e);if(action){e.preventDefault();travelHistory(action);return;}
    if(E.textEditing(e.target)||e.altKey)return;
    const key=e.key.toLowerCase();if(e.ctrlKey||e.metaKey){if(key==='c'&&state.selection.length){e.preventDefault();copySelection();}if(key==='v'&&clipboard.length){e.preventDefault();pasteSelection();}return;}
    if(key==='delete'||key==='backspace'){e.preventDefault();remove();return;}
    if(e.target.closest('button'))return;
    if(key==='v')setMode('select');if(key==='h')setMode('pan');if(key==='p')setMode('probe');if(key==='f')fit();if(e.code==='Space'){e.preventDefault();space=true;canvas.style.cursor='grab';}
  });
  document.addEventListener('keyup',e=>{if(e.code==='Space'){space=false;setMode(state.mode);}});window.addEventListener('blur',()=>{space=false;finishDrag();});
  function local(e){const box=canvas.getBoundingClientRect();return {x:e.clientX-box.left,y:e.clientY-box.top};}
  function pointerAt(pos){Object.assign(pointer,pos,{inside:true});pointer.world=P.screenToWorld(pos.x,pos.y,state.view,renderer.width,renderer.height);}
  function hit(pos){for(let i=engine.bodies.length-1;i>=0;i--){const b=engine.bodies[i],p=renderer.project(b.x,b.y,state.view),d=Math.hypot(pos.x-p.x,pos.y-p.y),r=b.radius*state.view.scale;if(b.type==='point'?d<21:b.type==='disk'?d<r+8:d<12||Math.abs(d-r)<12)return b;}return null;}
  canvas.addEventListener('pointerdown',e=>{
    if((e.button!==0&&e.button!==1)||activePointer!==null)return;
    e.preventDefault();const pos=local(e);pointerAt(pos);
    if(state.probe&&!space&&state.mode!=='pan'&&e.button!==1){closeProbe();canvas.focus({preventScroll:true});return;}
    if(state.mode==='probe'&&!space&&e.button===0){placeProbe(pointer.world.x,pointer.world.y);setMode('select');canvas.focus({preventScroll:true});return;}
    canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);activePointer=e.pointerId;const b=hit(pos);
    if(space||state.mode==='pan'||e.button===1){drag={kind:'pan',start:pos,view:{...state.view}};canvas.style.cursor='grabbing';}
    else if(b){pause();if(e.shiftKey){select(b.id,true);return;}const group=state.selection.includes(b.id)&&state.selection.length>1;if(!group)select(b.id);history.begin('Move '+state.selection.length+' charge(s)',snapshot());drag={kind:'body',start:pos,ids:[...state.selection],origin:{...pointer.world},bodies:S.clone(engine.bodies),clickSingle:group?b.id:null};canvas.style.cursor='grabbing';}
    else if(state.mode.startsWith('add-'))add(state.mode.slice(4),pointer.world.x,pointer.world.y);
    else{setSelection([]);renderList();renderProperties();drag={kind:'pan',start:pos,view:{...state.view}};canvas.style.cursor='grabbing';}
  });
  canvas.addEventListener('pointermove',e=>{if(activePointer!==null&&e.pointerId!==activePointer)return;const pos=local(e);pointerAt(pos);$('sim-cursor').textContent=`x ${U.coord(pointer.world.x)} m · y ${U.coord(pointer.world.y)} m`;
    if(drag?.kind==='body'){if(!drag.moved&&Math.hypot(pos.x-drag.start.x,pos.y-drag.start.y)<3)return;const bodies=E.translate(drag.bodies,drag.ids,pointer.world.x-drag.origin.x,pointer.world.y-drag.origin.y);try{commit(bodies,false);drag.moved=true;}catch(error){warning(error.message);}}
    else if(drag?.kind==='pan'){state.view.x=drag.view.x-(pos.x-drag.start.x)/state.view.scale;state.view.y=drag.view.y+(pos.y-drag.start.y)/state.view.scale;viewChanged();}
    else canvas.style.cursor=state.mode==='probe'?'crosshair':space||state.mode==='pan'||hit(pos)?'grab':state.mode.startsWith('add-')?'crosshair':'default';
  });
  function finishDrag(e){if(e?.pointerId!==undefined&&activePointer!==null&&e.pointerId!==activePointer)return;const active=drag;drag=null;if(active?.kind==='body'){if(active.moved)history.finish(snapshot());else{history.cancel();if(active.clickSingle)select(active.clickSingle);}}if(active){renderSettings();requestField(true);setMode(state.mode);}const id=activePointer;activePointer=null;if(id!==null&&canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);}
  canvas.addEventListener('pointerup',finishDrag);canvas.addEventListener('pointercancel',finishDrag);canvas.addEventListener('lostpointercapture',finishDrag);canvas.addEventListener('pointerleave',()=>{if(!drag){pointer.inside=false;updateProbe();}});
  canvas.addEventListener('wheel',e=>{e.preventDefault();const pos=local(e);pointerAt(pos);zoom(Math.exp(-Math.max(-100,Math.min(100,e.deltaY))*.0018),pos.x,pos.y);},{passive:false});canvas.addEventListener('contextmenu',e=>e.preventDefault());
  const resize=new ResizeObserver(()=>{pointer.inside=false;renderer.resize();viewChanged();updateProbe();});renderer.resize();resize.observe($('canvas-container'));
  $('sim-preset').replaceChildren(...Object.entries(S.PRESETS).map(([key,p])=>new Option(p.label,key)));
  try{const saved=sessionStorage.getItem(SESSION);if(saved){const data=JSON.parse(saved);if(Number.isFinite(data.referenceScale)&&data.referenceScale>0)referenceScale=data.referenceScale;load(data.scene||data,true);setSelection(data.selection??(engine.bodies.some(b=>b.id===data.selected)?[data.selected]:[]));renderList();renderProperties();if(Object.hasOwn(S.PRESETS,data.preset)){state.preset=data.preset;$('sim-preset').value=data.preset;$('preset-description').textContent=S.PRESETS[data.preset].description;}}else preset('single');}catch{preset('single');}
  function frame(now){if(disposed)return;const wall=Math.min(.1,Math.max(0,(now-lastFrame)/1000));lastFrame=now;slow=false;
    if(engine.status==='running'){
      accumulator=Math.min(.25,accumulator+wall*engine.settings.speed);const deadline=performance.now()+8;let steps=0;
      while(accumulator>=engine.settings.dt&&steps<80&&performance.now()<deadline){if(!engine.step()){warning(engine.message);accumulator=0;renderProperties();requestField(true);break;}accumulator-=engine.settings.dt;steps++;}
      slow=accumulator>.08;requestField();
    }
    if(now-lastUI>150){renderStats();lastUI=now;if(engine.status==='running'&&renderer.data.lines.length)$('sim-field-status').textContent=`${renderer.data.lines.length} lines · 배치 ${Math.max(0,engine.time-fieldSceneTime).toFixed(2)} s 전`;}
    if(now-lastProbe>100){updateProbe();lastProbe=now;}
    renderer.drawScene(state,pointer);animation=requestAnimationFrame(frame);
  }
  animation=requestAnimationFrame(frame);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){pause();saveSession();}});
  window.addEventListener('pagehide',()=>{pause();saveSession();disposed=true;cancelAnimationFrame(animation);worker?.terminate();resize.disconnect();});
  window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
})();
