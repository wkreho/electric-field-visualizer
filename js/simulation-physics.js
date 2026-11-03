/* XY-plane Coulomb quadrature and translational rigid-body dynamics.
 * No intrabody self-force, artificial repulsion, or force softening. */
(function(root) {
  'use strict';
  const P=root.EFPhysics||(typeof require!=='undefined'&&require('./physics.js'));
  const LIMITS=Object.freeze({bodies:16,position:1e6,charge:1e-3,minMass:1e-18,maxMass:1e6,minRadius:.005,maxRadius:1000,velocity:1e6,pairs:120000});
  const QUALITY=Object.freeze({low:{ring:16,radial:2,angular:16},medium:{ring:32,radial:4,angular:24},high:{ring:64,radial:8,angular:32}});
  const DEFAULTS=Object.freeze({dt:.002,speed:1,collisionRadius:.015,quality:'medium',fieldQuality:'low',fieldInterval:400,lineDensity:20,arrowDensity:1,lineWidth:1.1,arrowSize:4.5,showFieldLines:true,showArrows:true,showTrails:true,showVelocity:true,showForces:false,showGrid:true,showFieldControls:true});
  const clone=items=>items.map(b=>({...b}));
  const templates=new Map();
  function offsets(body,quality='medium') {
    if(body.type==='point')return [{x:0,y:0,w:1}];
    const key=`${body.type}:${body.radius}:${quality}`;if(templates.has(key))return templates.get(key);
    if(typeof quality!=='string'||!Object.hasOwn(QUALITY,quality))throw new Error('알 수 없는 샘플 품질입니다.');
    const profile=QUALITY[quality];
    const result=[],nr=body.type==='ring'?1:profile.radial,nt=body.type==='ring'?profile.ring:profile.angular;
    for(let j=0;j<nr;j++){
      // Uniform midpoint cells in r²: every annulus/sector has identical area.
      const r=body.type==='ring'?body.radius:body.radius*Math.sqrt((j+.5)/nr);
      for(let i=0;i<nt/2;i++){
        const angle=(i+(j%2)*.5)*2*Math.PI/nt,x=r*Math.cos(angle),y=r*Math.sin(angle),w=1/(nr*nt);
        // Antipodal pairs preserve the exact centroid and central symmetry.
        result.push({x,y,w},{x:-x,y:-y,w});
      }
    }
    if(templates.size>=128)templates.delete(templates.keys().next().value);
    templates.set(key,result);return result;
  }
  function samples(bodies,quality='medium',excludeId=null){
    const result=[];
    for(const b of bodies)if(b.id!==excludeId&&b.q!==0)for(const p of offsets(b,quality))result.push({id:result.length+1,ownerId:b.id,x:b.x+p.x,y:b.y+p.y,q:b.q*p.w});
    return result;
  }
  function fieldAt(x,y,bodies,quality='medium',excludeId=null){return P.fieldAt(x,y,samples(bodies,quality,excludeId));}
  function gap(a,b){
    const d=Math.hypot(a.x-b.x,a.y-b.y),ra=a.type==='point'?0:a.radius,rb=b.type==='point'?0:b.radius;
    if(a.type==='ring'&&b.type==='ring')return Math.max(d-ra-rb,Math.abs(ra-rb)-d);
    if(a.type==='ring')return Math.abs(d-ra)-rb;
    if(b.type==='ring')return Math.abs(d-rb)-ra;
    return d-ra-rb;
  }
  function contact(bodies,radius){
    for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++)if(gap(bodies[i],bodies[j])<=radius)return `${bodies[i].name} / ${bodies[j].name}: 전하 분포가 접촉하거나 너무 가깝습니다.`;
    return '';
  }
  function workCount(bodies,quality){
    const counts=bodies.map(b=>b.q===0?0:offsets(b,quality).length);let cost=0;
    for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++)if(!bodies[i].fixed||!bodies[j].fixed)cost+=counts[i]*counts[j];return cost;
  }
  function forces(bodies,quality='medium'){
    if(workCount(bodies,quality)>LIMITS.pairs)throw new Error('힘 계산 샘플쌍이 120,000개를 초과합니다. 물체 수나 샘플 품질을 낮추세요.');
    const result=bodies.map(()=>({x:0,y:0})),nodes=bodies.map(b=>offsets(b,quality));
    for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++){
      const a=bodies[i],b=bodies[j];if((a.fixed&&b.fixed)||!a.q||!b.q)continue;
      let fx=0,fy=0;
      for(const u of nodes[i])for(const v of nodes[j]){
        const dx=a.x+u.x-b.x-v.x,dy=a.y+u.y-b.y-v.y,r=Math.hypot(dx,dy);
        if(r===0)throw new Error('샘플 특이점: 겹친 물체의 위치를 조정하세요.');
        const f=P.K*(a.q*u.w)*(b.q*v.w)/r/r;fx+=f*dx/r;fy+=f*dy/r;
      }
      if(!Number.isFinite(fx)||!Number.isFinite(fy))throw new Error('유한하지 않은 전기력이 감지되어 정지했습니다.');
      // Compute each pair once: Newton's third law holds at quadrature precision.
      result[i].x+=fx;result[i].y+=fy;result[j].x-=fx;result[j].y-=fy;
    }
    return result;
  }
  function energy(bodies,quality='medium'){
    let kinetic=0,potential=0;
    for(const b of bodies)if(!b.fixed)kinetic+=.5*b.mass*(b.vx*b.vx+b.vy*b.vy);
    for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++){
      const a=bodies[i],b=bodies[j];if((a.fixed&&b.fixed)||!a.q||!b.q)continue;
      for(const u of offsets(a,quality))for(const v of offsets(b,quality))potential+=P.K*(a.q*u.w)*(b.q*v.w)/Math.hypot(a.x+u.x-b.x-v.x,a.y+u.y-b.y-v.y);
    }
    return {kinetic,potential,total:kinetic+potential};
  }
  function number(value,min,max,label){
    const n=P.parseNumber(value,Math.max(Math.abs(min),Math.abs(max)),label);
    if(n<min||n>max)throw new Error(`${label}: ${min} ~ ${max} 범위로 입력하세요.`);return n;
  }
  function validateBodies(input){
    if(!Array.isArray(input)||input.length>LIMITS.bodies)throw new Error('물체는 최대 16개까지 배치할 수 있습니다.');
    const result=[],usedIds=new Set();
    for(const raw of input){
      if(!raw||!['point','ring','disk'].includes(raw.type))throw new Error('물체 종류는 point, ring, disk여야 합니다.');
      const id=raw.id;if(!Number.isSafeInteger(id)||id<1||id>1e9||usedIds.has(id))throw new Error('물체 ID는 중복되지 않는 1~1e9 정수여야 합니다.');usedIds.add(id);
      if(typeof raw.fixed!=='boolean')throw new Error('Fixed / Free 설정이 잘못되었습니다.');
      const name=P.validateName(raw.name,result);
      const body={id,name,type:raw.type,fixed:raw.fixed,q:number(raw.q,-LIMITS.charge,LIMITS.charge,'전하량'),x:number(raw.x,-LIMITS.position,LIMITS.position,'X'),y:number(raw.y,-LIMITS.position,LIMITS.position,'Y'),radius:raw.type==='point'?0:number(raw.radius,LIMITS.minRadius,LIMITS.maxRadius,'반지름'),mass:number(raw.mass??1e-8,LIMITS.minMass,LIMITS.maxMass,'질량'),vx:number(raw.vx??0,-LIMITS.velocity,LIMITS.velocity,'Vx'),vy:number(raw.vy??0,-LIMITS.velocity,LIMITS.velocity,'Vy')};
      if(body.fixed){body.vx=0;body.vy=0;}result.push(body);
    }
    return result;
  }
  function validateSettings(input={}){
    if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('설정 형식이 잘못되었습니다.');
    const settings={...DEFAULTS},ranges={dt:[1e-5,.02],speed:[.1,8],collisionRadius:[1e-5,.2],fieldInterval:[150,1500],lineDensity:[8,64],arrowDensity:[.4,2],lineWidth:[.5,3],arrowSize:[3,9]};
    for(const [key,[min,max]]of Object.entries(ranges))if(key in input)settings[key]=number(input[key],min,max,key);
    for(const key of ['quality','fieldQuality'])if(key in input){if(typeof input[key]!=='string'||!Object.hasOwn(QUALITY,input[key]))throw new Error('샘플 품질 설정이 잘못되었습니다.');settings[key]=input[key];}
    for(const key of ['showFieldLines','showArrows','showTrails','showVelocity','showForces','showGrid','showFieldControls'])if(key in input){if(typeof input[key]!=='boolean')throw new Error('표시 설정은 true 또는 false여야 합니다.');settings[key]=input[key];}
    return settings;
  }
  function validateScene(data){
    if(data?.version===1&&Array.isArray(data.charges)&&(!data.application||data.application==='FIELDWORK')){
      const legacy=P.validateScene(data);
      data={application:'FIELDWORK_SIMULATION',version:1,bodies:legacy.charges.map(c=>body(c.id,c.name,'point',c.q,c.x,c.y)),settings:legacy.settings,view:legacy.view,time:0};
    }
    if(!data||data.application!=='FIELDWORK_SIMULATION'||data.version!==1)throw new Error('FIELDWORK Simulation 또는 기존 FIELDWORK JSON(version 1)을 선택하세요.');
    const bodies=validateBodies(data.bodies),initial=validateBodies(data.initialBodies??data.bodies),settings=validateSettings(data.settings);
    if(initial.length!==bodies.length||bodies.some(b=>!initial.some(i=>i.id===b.id)))throw new Error('현재 배치와 초기 배치의 ID가 일치하지 않습니다.');
    const view=data.view;if(!view)throw new Error('화면 설정이 없습니다.');
    const camera={x:number(view.x,-LIMITS.position,LIMITS.position,'화면 X'),y:number(view.y,-LIMITS.position,LIMITS.position,'화면 Y'),scale:number(view.scale,1e-9,1e6,'확대율')};
    const time=number(data.time??0,0,1e9,'시뮬레이션 시간');
    for(const list of [bodies,initial]){const message=contact(list,settings.collisionRadius);if(message)throw new Error(message);forces(list,settings.quality);}
    return {bodies,initial,settings,view:camera,time};
  }
  class Engine {
    constructor(bodies=[],settings={}){this.settings=validateSettings(settings);this.bodies=[];this.initial=[];this.time=0;this.status='ready';this.message='';this.trails=new Map();this.replace(bodies);}
    replace(bodies){
      const next=validateBodies(bodies),message=contact(next,this.settings.collisionRadius);if(message)throw new Error(message);
      const f=forces(next,this.settings.quality);this.bodies=next;this.initial=clone(next);this.forces=f;this.time=0;this.status='ready';this.message='';this.clearTrails();
    }
    configure(changes){const next=validateSettings({...this.settings,...changes}),message=contact(this.bodies,next.collisionRadius);if(message)throw new Error(message);const f=next.quality===this.settings.quality?this.forces:forces(this.bodies,next.quality);this.settings=next;this.forces=f;}
    start(){if(!this.bodies.length)throw new Error('먼저 전하를 추가하세요.');this.message='';this.status='running';}
    pause(message=''){if(this.status==='running'||message)this.status='paused';this.message=message;}
    reset(){this.bodies=clone(this.initial);this.forces=forces(this.bodies,this.settings.quality);this.time=0;this.status='ready';this.message='';this.clearTrails();}
    restore(data){this.settings=data.settings;this.bodies=clone(data.bodies);this.initial=clone(data.initial);this.time=data.time;this.forces=forces(this.bodies,this.settings.quality);this.status=data.time>0?'paused':'ready';this.message='';this.clearTrails();}
    clearTrails(){this.trails=new Map(this.bodies.map(b=>[b.id,[b.x,b.y]]));this.lastTrail=this.time;}
    step(dt=this.settings.dt){
      if(this.status!=='running')return false;
      try{
        number(dt,1e-5,.02,'Δt');
        const candidates=clone(this.bodies),travel=[];
        for(let i=0;i<candidates.length;i++){
          const b=candidates[i],old=this.bodies[i];
          if(!b.fixed){b.vx+=.5*dt*this.forces[i].x/b.mass;b.vy+=.5*dt*this.forces[i].y/b.mass;b.x+=dt*b.vx;b.y+=dt*b.vy;}
          travel.push(Math.hypot(b.x-old.x,b.y-old.y));
          if(![b.x,b.y,b.vx,b.vy].every(Number.isFinite)||Math.abs(b.x)>LIMITS.position||Math.abs(b.y)>LIMITS.position||Math.hypot(b.vx,b.vy)>LIMITS.velocity)throw new Error('위치·속도 안전 범위를 초과했습니다. 전하량·질량·초기 속도·Δt를 조정하세요.');
        }
        const message=contact(candidates,this.settings.collisionRadius);if(message)throw new Error(message+' 마지막 안전 상태에서 일시정지했습니다.');
        for(let i=0;i<candidates.length;i++)for(let j=i+1;j<candidates.length;j++){
          const clearance=gap(this.bodies[i],this.bodies[j])-this.settings.collisionRadius;
          if(travel[i]+travel[j]>.4*clearance)throw new Error('근접 물체 사이에서 한 스텝 이동량이 너무 큽니다. 마지막 안전 상태에서 정지했습니다. Δt를 줄이거나 배치를 조정하세요.');
        }
        const f=forces(candidates,this.settings.quality);
        for(let i=0;i<candidates.length;i++)if(!candidates[i].fixed){const b=candidates[i];b.vx+=.5*dt*f[i].x/b.mass;b.vy+=.5*dt*f[i].y/b.mass;if(!Number.isFinite(b.vx)||!Number.isFinite(b.vy)||Math.hypot(b.vx,b.vy)>LIMITS.velocity)throw new Error('속도 안전 제한으로 일시정지했습니다. Δt 또는 전하량을 줄이세요.');}
        this.bodies=candidates;this.forces=f;this.time+=dt;
        if(this.time-this.lastTrail>=.02-1e-12){for(const b of this.bodies)if(!b.fixed){const trail=this.trails.get(b.id);trail.push(b.x,b.y);if(trail.length>2048)trail.splice(0,trail.length-2048);}this.lastTrail=this.time;}
        return true;
      }catch(error){this.pause(error.message);return false;}
    }
  }
  function body(id,name,type,q,x,y,fixed=true,radius=0,mass=1e-8,vx=0,vy=0){return {id,name,type,q,x,y,fixed,radius,mass,vx,vy};}
  const PRESETS=Object.freeze({
    fieldPositive:{label:'Field · Single Positive',description:'고정 양전하의 방사형 전기장입니다.',bodies:[body(1,'Q1','point',1e-9,0,0)]},
    fieldNegative:{label:'Field · Single Negative',description:'고정 음전하로 향하는 전기장입니다.',bodies:[body(1,'Q1','point',-1e-9,0,0)]},
    fieldDipole:{label:'Field · Dipole',description:'같은 크기의 고정 양·음전하입니다.',bodies:[body(1,'Q1','point',1e-9,-1,0),body(2,'Q2','point',-1e-9,1,0)]},
    fieldLike:{label:'Field · Like Charges',description:'두 고정 양전하의 전기장입니다.',bodies:[body(1,'Q1','point',1e-9,-1,0),body(2,'Q2','point',1e-9,1,0)]},
    fieldUnequal:{label:'Field · Unequal Charges',description:'전하량 비가 1 : −3인 고정 전하입니다.',bodies:[body(1,'Q1','point',1e-9,-1,0),body(2,'Q2','point',-3e-9,1,0)]},
    single:{label:'Fixed + Free Point',description:'음전하의 초기 속도가 만드는 고정 양전하 주변의 궤도 운동입니다.',bodies:[body(1,'Source','point',1e-8,0,0),body(2,'Test','point',-1e-9,1.5,0,false,0,1e-8,0,Math.sqrt(P.K*1e-9/1.5))]},
    dipole:{label:'Electric Dipole',description:'고정 쌍극자의 비균일 전기장이 시험전하의 실제 경로를 휘게 합니다.',bodies:[body(1,'Positive','point',1e-8,-1,0),body(2,'Negative','point',-1e-8,1,0),body(3,'Test','point',1e-10,0,1.6,false,0,1e-8,0,.3)]},
    like:{label:'Two Positive Charges',description:'두 고정 양전하로부터 같은 부호의 자유 전하가 밀려납니다.',bodies:[body(1,'Left','point',1e-8,-1,0),body(2,'Right','point',1e-8,1,0),body(3,'Test','point',1e-9,0,.45,false,0,1e-8,.2,0)]},
    ring:{label:'Charged Ring',description:'양전하 링의 빈 내부에서 같은 부호 시험전하가 중심 방향의 힘을 받습니다.',bodies:[body(1,'Ring','ring',1e-8,0,0,true,1.1),body(2,'Test','point',1e-9,.3,0,false,0,1e-8,0,.18)]},
    disk:{label:'Charged Disk',description:'원판 바깥의 자유 양전하가 균일한 양전하 원판으로부터 반발합니다.',bodies:[body(1,'Disk','disk',1e-8,0,0,true,.85),body(2,'Test','point',1e-9,1.5,0,false,0,1e-8,0,.4)]},
    moving:{label:'Multiple Moving Charges',description:'두 자유 양전하가 서로 반발하며 질량중심의 운동량을 보존합니다.',bodies:[body(1,'Moving A','point',1e-9,-.8,0,false,0,1e-8,0,.2),body(2,'Moving B','point',1e-9,.8,0,false,0,1e-8,0,-.2)]}
  });
  function serialize(engine,view){return {application:'FIELDWORK_SIMULATION',version:1,bodies:clone(engine.bodies),initialBodies:clone(engine.initial),time:engine.time,settings:{...engine.settings},view:{...view}};}
  const api={LIMITS,QUALITY,DEFAULTS,PRESETS,clone,offsets,samples,fieldAt,gap,contact,workCount,forces,energy,number,validateBodies,validateSettings,validateScene,serialize,Engine,body};root.EFSimulation=api;if(typeof module!=='undefined')module.exports=api;
})(typeof self!=='undefined'?self:globalThis);
