(function(root){
  'use strict';
  const S=root.EFSimulation||(typeof require!=='undefined'&&require('./simulation-physics.js'));
  const P=root.EFPhysics||(typeof require!=='undefined'&&require('./physics.js'));
  function selection(bodies,ids){return [...new Set(ids)].filter(id=>bodies.some(b=>b.id===id));}
  function toggle(ids,id){return ids.includes(id)?ids.filter(i=>i!==id):[...ids,id];}
  function translate(bodies,ids,dx,dy){return bodies.map(b=>ids.includes(b.id)?{...b,x:b.x+dx,y:b.y+dy,vx:0,vy:0}:{...b});}
  function copy(bodies,ids,initial=bodies){return S.clone(bodies.filter(b=>ids.includes(b.id))).map(b=>{const start=initial.find(i=>i.id===b.id)||b;return {...b,vx:start.vx,vy:start.vy};});}
  function copyName(name,bodies){
    if(/^Q\d+$/i.test(name))return P.nextChargeName(bodies);
    const base=name.replace(/ Copy(?: \d+)?$/i,'');
    for(let n=1;n<1000;n++){const suffix=' Copy'+(n===1?'':' '+n),candidate=Array.from(base).slice(0,40-suffix.length).join('')+suffix;try{return P.validateName(candidate,bodies);}catch{}}
    throw new Error('복제 전하의 고유 이름을 생성할 수 없습니다.');
  }
  function planPaste(items,bodies,settings,anchor=null,serial=0){
    if(!items.length)throw new Error('먼저 전하를 선택하고 복사하세요.');
    if(items.length+bodies.length>S.LIMITS.bodies)throw new Error('붙여넣기 취소: 물체는 최대 16개입니다.');
    const center={x:items.reduce((n,b)=>n+b.x,0)/items.length,y:items.reduce((n,b)=>n+b.y,0)/items.length};
    const extent=Math.max(.25,Math.max(...items.map(b=>b.x+b.radius))-Math.min(...items.map(b=>b.x-b.radius))+.1,Math.max(...items.map(b=>b.y+b.radius))-Math.min(...items.map(b=>b.y-b.radius))+.1);
    let lastError;
    for(let attempt=0;attempt<24;attempt++){
      const offset=serial+attempt+(anchor?0:1),target=anchor||center,dx=target.x-center.x+offset*extent,dy=target.y-center.y-offset*extent*.6;
      try{
        const all=S.clone(bodies),created=[];
        for(const item of items){let id=1;while(all.some(b=>b.id===id))id++;const body={...item,id,name:copyName(item.name,all),x:item.x+dx,y:item.y+dy};all.push(body);created.push(body);}
        const valid=S.validateBodies(all),contact=S.contact(valid,settings.collisionRadius);if(contact)throw new Error(contact);
        S.forces(valid,settings.quality);if(S.samples(valid,settings.fieldQuality).length>512)throw new Error('Field 샘플 512개 제한을 초과합니다.');
        return {bodies:valid,ids:created.map(b=>b.id),nextSerial:offset+1};
      }catch(error){lastError=error;}
    }
    throw new Error('붙여넣기 취소: '+lastError.message);
  }
  function probe(x,y,bodies,quality){
    const point={x:S.number(x,-S.LIMITS.position,S.LIMITS.position,'Probe X'),y:S.number(y,-S.LIMITS.position,S.LIMITS.position,'Probe Y')};
    const e=S.fieldAt(point.x,point.y,bodies,quality),invalid=e.singular||![e.x,e.y,e.magnitude].every(Number.isFinite);
    return {...point,ex:invalid?null:e.x,ey:invalid?null:e.y,magnitude:invalid?null:e.magnitude,direction:invalid||e.magnitude===0?null:(Math.atan2(e.y,e.x)*180/Math.PI+360)%360,singular:invalid};
  }
  function textEditing(target){return !!(target?.isContentEditable||target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])'));}
  const api={selection,toggle,translate,copy,copyName,planPaste,probe,textEditing};root.EFEditing=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
