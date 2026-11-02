(function(){
  'use strict';
  const P=EFPhysics,U=EFUI,$=U.$,canvas=$('field-canvas'),renderer=new EFRenderer.Renderer(canvas);
  const state={charges:[],selected:null,nextId:1,mode:'select',maximized:false,view:{x:0,y:0,scale:130},settings:{...P.DEFAULTS}};
  const pointer={inside:false,x:0,y:0,world:{x:0,y:0}};
  let drag=null,space=false,worker=null,busy=false,pending=null,revision=0,queued=false,paintQueued=false,lastError=false,exportPending=false,zoomReference=130,activePointer=null;
  const presets={
    positive:{title:'Single Positive',description:'한 점에서 사방으로 퍼져나가는 전기장',charges:[[0,0,1e-9]]},
    negative:{title:'Single Negative',description:'모든 방향에서 하나의 점으로 모이는 전기장',charges:[[0,0,-1e-9]]},
    dipole:{title:'Electric Dipole',description:'반대 부호의 두 전하가 만드는 전기장',charges:[[-1,0,1e-9],[1,0,-1e-9]]},
    like:{title:'Two Positive Charges',description:'같은 부호의 두 전하 · 중심에서 상쇄되는 전기장',charges:[[-1,0,1e-9],[1,0,1e-9]]},
    unequal:{title:'Unequal Charges',description:'전하량에 따른 전기력선 분포 · +1 nC / −3 nC',charges:[[-1,0,1e-9],[1,0,-3e-9]]}
  };
  function snapshot(){return {charges:state.charges.map(c=>({...c})),view:{...state.view},settings:{...state.settings},width:renderer.width,height:renderer.height};}
  function redraw(background=false){if(background)renderer.drawBackground(state);if(paintQueued)return;paintQueued=true;requestAnimationFrame(()=>{paintQueued=false;renderer.draw(state,pointer);});}
  function updateView(){
    state.view.x=Math.max(-P.LIMITS.coordinate,Math.min(P.LIMITS.coordinate,state.view.x));state.view.y=Math.max(-P.LIMITS.coordinate,Math.min(P.LIMITS.coordinate,state.view.y));
    const percent=state.view.scale/zoomReference*100;
    $('zoom-value').textContent=(percent<1?percent.toPrecision(2):Math.round(percent))+'%';
    if(pointer.inside){pointer.world=P.screenToWorld(pointer.x,pointer.y,state.view,renderer.width,renderer.height);U.probe(pointer,state);}redraw(true);compute();
  }
  function compute(){
    revision++;$('compute-status').textContent='계산 중';$('status-text').textContent='전기력선 계산 중';
    if(queued)return;queued=true;
    requestAnimationFrame(()=>{queued=false;pending={id:revision,scene:snapshot()};dispatch();});
  }
  function dispatch(){
    if(busy||!pending)return;const job=pending;pending=null;busy=true;
    if(worker)worker.postMessage(job);
    else setTimeout(()=>{try{receive({id:job.id,result:EFLines.generate(job.scene)});}catch(err){receive({id:job.id,error:err.message});}},0);
  }
  function receive(message){
    busy=false;
    if(message.error){$('compute-status').textContent='오류';U.toast('계산 오류: '+message.error);exportPending=false;}
    else if(message.id===revision){renderer.data=message.result;redraw(true);$('line-count').textContent=`${message.result.lines.length} lines`;$('compute-status').textContent=`${Math.round(message.result.ms)} ms`;$('status-text').textContent=selectionStatus();if(exportPending){exportPending=false;exportPNG();}}
    dispatch();
  }
  try{if(location.protocol!=='file:'){worker=new Worker('js/worker.js');worker.onmessage=e=>receive(e.data);worker.onerror=()=>{worker.terminate();worker=null;busy=false;if(!lastError){lastError=true;U.toast('기본 계산 모드로 전환했습니다.');}compute();};}}catch{worker=null;}
  const callbacks={select,remove};
  function refresh(edit=true){U.refresh(state,callbacks,edit);}
  function selectionStatus(){const c=state.charges.find(c=>c.id===state.selected);return c?`${c.name} 선택됨`:'준비됨';}
  function select(id){state.selected=id;refresh();redraw();$('status-text').textContent=selectionStatus();}
  function custom(){ $('preset').selectedIndex=-1; }
  function changed(){custom();refresh();U.probe(pointer,state);redraw(true);compute();}
  function add(x,y,q){if(state.charges.length>=P.LIMITS.charges){U.toast('최대 200개의 전하를 배치할 수 있습니다.');return;}if(Math.abs(x)>P.LIMITS.coordinate||Math.abs(y)>P.LIMITS.coordinate){U.toast('좌표 범위는 ±1e9 m입니다.');return;}const c={id:state.nextId++,name:P.nextChargeName(state.charges),x,y,q};state.charges.push(c);state.selected=c.id;changed();}
  function edit(values){const c=state.charges.find(c=>c.id===state.selected);if(!c)return;Object.assign(c,values);changed();}
  function remove(id){const index=state.charges.findIndex(c=>c.id===id);if(index<0)return;state.charges.splice(index,1);if(state.selected===id)state.selected=state.charges[Math.min(index,state.charges.length-1)]?.id??null;changed();}
  function setMode(mode){state.mode=mode;document.querySelectorAll('[data-mode]').forEach(b=>{b.classList.toggle('active',b.dataset.mode===mode);b.setAttribute('aria-pressed',String(b.dataset.mode===mode));});canvas.style.cursor=space||mode==='pan'?'grab':mode==='select'?'default':'crosshair';}
  function maximize(active){
    state.maximized=active;drag=null;space=false;pointer.inside=false;
    if(activePointer!==null&&canvas.hasPointerCapture(activePointer))canvas.releasePointerCapture(activePointer);activePointer=null;
    document.body.classList.toggle('field-maximized',active);
    const button=$('maximize-btn'),label=active?'필드 복원':'필드 최대화';button.setAttribute('aria-label',label);button.setAttribute('aria-pressed',String(active));button.title=active?'필드 복원 (Esc)':label;
    $('maximize-icon').setAttribute('d',active?'M9 3h12v12M3 9h12v12H3z':'M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5');
    U.probe(pointer,state);setMode(state.mode);
    // ResizeObserver redraws at the new CSS size without changing the camera.
    requestAnimationFrame(()=>{(active?canvas:button).focus({preventScroll:true});});
  }
  function defaultScale(){return Math.max(25,Math.min(145,renderer.width/7.8,renderer.height/5.2));}
  function resetView(){zoomReference=defaultScale();state.view={x:0,y:0,scale:zoomReference};updateView();}
  function fit(){
    if(!state.charges.length){resetView();return;}
    const xs=state.charges.map(c=>c.x),ys=state.charges.map(c=>c.y),left=Math.min(...xs),right=Math.max(...xs),bottom=Math.min(...ys),top=Math.max(...ys);
    state.view={x:(left+right)/2,y:(top+bottom)/2,scale:Math.max(1e-9,Math.min(1e6,Math.max(80,renderer.width-120)/Math.max(right-left,3.5),Math.max(80,renderer.height-160)/Math.max(top-bottom,3.5)))};updateView();
  }
  function preset(name){const p=presets[name];state.nextId=1;state.charges=p.charges.map(([x,y,q],i)=>({id:state.nextId++,name:`Q${i+1}`,x,y,q}));state.selected=state.charges[0].id;$('preset').value=name;setMode('select');refresh();resetView();U.probe(pointer,state);}
  function zoom(factor,x=renderer.width/2,y=renderer.height/2){state.view=P.zoomAt(state.view,factor,x,y,renderer.width,renderer.height);updateView();}
  function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
  function save(){const data={version:1,application:'FIELDWORK',charges:state.charges.map(c=>({...c})),view:{...state.view},settings:{...state.settings}};download(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),'fieldwork-scene.json');U.toast('현재 배치를 JSON으로 저장했습니다.');}
  function load(data){const validated=P.validateScene(data);state.charges=validated.charges;state.view=validated.view;state.settings=validated.settings;state.nextId=Math.max(0,...state.charges.map(c=>c.id))+1;state.selected=state.charges[0]?.id??null;custom();refresh();U.settings(state);updateView();U.toast('전하 배치와 화면 설정을 불러왔습니다.');}
  function exportPNG(){const output=renderer.exportPNG(state);output.toBlob(blob=>{if(blob){download(blob,'fieldwork-electric-field.png');U.toast('현재 화면을 PNG로 저장했습니다.');}else U.toast('이미지를 저장할 수 없습니다.');},'image/png');redraw();}
  function png(){if(busy||pending||queued){exportPending=true;U.toast('최신 전기력선 계산 후 이미지를 저장합니다.');}else exportPNG();}
  const app={setMode,maximize,preset,select,remove,edit,clear:()=>{state.charges=[];state.selected=null;changed();},resetView,fit,zoom,save,load,png,space:active=>{space=active;setMode(state.mode);},settingChanged:key=>{if(key==='lineDensity')compute();else if(key!=='showFieldControls')redraw(true);}};
  U.bind(state,app);
  function local(event){const r=canvas.getBoundingClientRect();return {x:event.clientX-r.left,y:event.clientY-r.top};}
  function movePointer(pos){pointer.x=pos.x;pointer.y=pos.y;pointer.inside=true;pointer.world=P.screenToWorld(pos.x,pos.y,state.view,renderer.width,renderer.height);U.probe(pointer,state);}
  function hit(pos){let closest=null,distance=21;for(let i=state.charges.length-1;i>=0;i--){const c=state.charges[i],p=renderer.project(c.x,c.y,state.view),d=Math.hypot(pos.x-p.x,pos.y-p.y);if(d<distance){closest=c;distance=d;}}return closest;}
  canvas.addEventListener('pointerdown',e=>{
    if(e.button!==0&&e.button!==1)return;e.preventDefault();canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);activePointer=e.pointerId;const pos=local(e);movePointer(pos);const target=hit(pos),pan=space||state.mode==='pan'||e.button===1;
    if(pan){drag={kind:'pan',start:pos,view:{...state.view},moved:false};canvas.style.cursor='grabbing';}
    else if(target){select(target.id);drag={kind:'charge',id:target.id,offset:{x:target.x-pointer.world.x,y:target.y-pointer.world.y}};canvas.style.cursor='grabbing';}
    else if(state.mode==='positive'||state.mode==='negative'){add(pointer.world.x,pointer.world.y,state.mode==='positive'?1e-9:-1e-9);}
    else{select(null);drag={kind:'pan',start:pos,view:{...state.view},moved:false};canvas.style.cursor='grabbing';}
  });
  canvas.addEventListener('pointermove',e=>{
    const pos=local(e);movePointer(pos);
    if(drag?.kind==='charge'){
      const c=state.charges.find(c=>c.id===drag.id);if(c){c.x=Math.max(-P.LIMITS.coordinate,Math.min(P.LIMITS.coordinate,pointer.world.x+drag.offset.x));c.y=Math.max(-P.LIMITS.coordinate,Math.min(P.LIMITS.coordinate,pointer.world.y+drag.offset.y));custom();refresh();U.probe(pointer,state);compute();redraw(true);}
    }else if(drag?.kind==='pan'){
      state.view.x=drag.view.x-(pos.x-drag.start.x)/state.view.scale;state.view.y=drag.view.y+(pos.y-drag.start.y)/state.view.scale;updateView();
    }else canvas.style.cursor=space||state.mode==='pan'?'grab':hit(pos)?'grab':state.mode==='select'?'default':'crosshair';
    redraw();
  });
  function endDrag(e){if(drag){drag=null;U.probe(pointer,state);compute();setMode(state.mode);}if(e&&canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);activePointer=null;}
  canvas.addEventListener('pointerup',endDrag);canvas.addEventListener('pointercancel',endDrag);canvas.addEventListener('lostpointercapture',()=>{if(drag){drag=null;compute();}});
  canvas.addEventListener('pointerleave',()=>{if(!drag){pointer.inside=false;U.probe(pointer,state);redraw();}});
  canvas.addEventListener('wheel',e=>{e.preventDefault();const pos=local(e);movePointer(pos);zoom(Math.exp(-Math.max(-100,Math.min(100,e.deltaY))*.0018),pos.x,pos.y);},{passive:false});
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  const resize=new ResizeObserver(()=>{pointer.inside=false;U.probe(pointer,state);renderer.resize();updateView();});renderer.resize();resize.observe($('canvas-container'));preset('dipole');
  // Read-only diagnostics for reproducible measurement and integration checks.
  window.fieldLab=Object.freeze({getState:()=>JSON.parse(JSON.stringify(state)),getDiagnostics:()=>({lines:renderer.data.lines.length,ms:renderer.data.ms,computing:busy||!!pending||queued,worker:!!worker,width:renderer.width,height:renderer.height}),fieldAt:(x,y)=>P.fieldAt(x,y,state.charges)});
  window.addEventListener('pagehide',()=>{worker?.terminate();resize.disconnect();});
})();
