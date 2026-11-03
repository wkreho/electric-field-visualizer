const {test}=require('node:test');
const assert=require('node:assert/strict');
const P=require('../js/physics.js'),S=require('../js/simulation-physics.js'),F=require('../js/simulation-fields.js');
const pt=(id,q,x=0,y=0,fixed=false,mass=1e-8,vx=0,vy=0)=>S.body(id,`Q${id}`,'point',q,x,y,fixed,0,mass,vx,vy);
function close(a,b,tol=1e-10){assert.ok(Math.abs(a-b)<=tol*Math.max(1e-30,Math.abs(a),Math.abs(b)),`${a} != ${b}`);}
function run(bodies,steps=50,settings={}){const e=new S.Engine(bodies,settings);e.start();for(let i=0;i<steps;i++)assert.equal(e.step(),true,e.message);return e;}

test('1. fixed positive charge holds its position and zero velocity',()=>{
  const e=run([pt(1,1e-9,0,0,true),pt(2,1e-9,1)],100);assert.equal(e.bodies[0].x,0);assert.equal(e.bodies[0].y,0);assert.equal(e.bodies[0].vx,0);assert.ok(e.time>0);
});
test('2. free positive charge is repelled by a fixed positive',()=>{const e=run([pt(1,1e-9,0,0,true),pt(2,1e-9,1)]);assert.ok(e.bodies[1].x>1);assert.ok(e.bodies[1].vx>0);});
test('3. free negative charge is attracted to a fixed positive',()=>{const e=run([pt(1,1e-9,0,0,true),pt(2,-1e-9,1)]);assert.ok(e.bodies[1].x<1);assert.ok(e.bodies[1].vx<0);});
test('4. reversing charge sign reverses the exact initial force',()=>{
  const a=S.forces([pt(1,1e-9,0,0,true),pt(2,1e-9,1)])[1],b=S.forces([pt(1,1e-9,0,0,true),pt(2,-1e-9,1)])[1];close(a.x,-b.x);close(a.y,b.y);close(a.x,P.K*1e-18);
});
test('5. q=0 means no electric force, with inertial velocity preserved',()=>{
  const e=run([pt(1,1e-8,0,0,true),pt(2,0,1,0,false,1e-8,.25,.1)],100);assert.deepEqual(e.forces[1],{x:0,y:0});close(e.bodies[1].vx,.25);close(e.bodies[1].vy,.1);close(e.bodies[1].x,1.05);
});
test('6. doubling mass halves acceleration at the same charge configuration',()=>{
  const a=[pt(1,1e-9,0,0,true),pt(2,1e-9,1)],b=S.clone(a);b[1].mass*=2;const f=S.forces(a)[1],g=S.forces(b)[1];close(f.x,g.x);close(f.x/a[1].mass/2,g.x/b[1].mass);
  const steppedA=run(a,1,{dt:1e-4}),steppedB=run(b,1,{dt:1e-4});close(steppedB.bodies[1].vx,steppedA.bodies[1].vx/2,1e-7);
});
test('7. ring center XY electric field cancels by symmetry',()=>{for(const quality of Object.keys(S.QUALITY)){const b=S.body(1,'Ring','ring',1e-8,0,0,true,1),e=S.fieldAt(0,0,[b],quality);assert.ok(Math.abs(e.x)<1e-12);assert.ok(Math.abs(e.y)<1e-12);}});
test('8. disk center XY electric field cancels by symmetry',()=>{for(const quality of Object.keys(S.QUALITY)){const b=S.body(1,'Disk','disk',1e-8,0,0,true,1),e=S.fieldAt(0,0,[b],quality);assert.ok(Math.abs(e.x)<1e-12);assert.ok(Math.abs(e.y)<1e-12);}});
test('9. all ring and disk sample charges sum to Q',()=>{
  for(const type of ['ring','disk'])for(const quality of Object.keys(S.QUALITY)){const b=S.body(1,type,type,-3.5e-9,.2,-.3,true,.8),nodes=S.samples([b],quality);close(nodes.reduce((s,n)=>s+n.q,0),b.q,1e-13);close(nodes.reduce((s,n)=>s+n.x*n.q,0)/b.q,b.x,1e-12);}
});
test('disk quadrature has equal-area annuli, rather than equal-radius density bias',()=>{
  const disk=S.body(1,'Disk','disk',1e-8,0,0,true,1),nodes=S.offsets(disk,'high'),counts=Array(8).fill(0);for(const p of nodes)counts[Math.floor((p.x*p.x+p.y*p.y)*8)]++;
  assert.deepEqual(counts,Array(8).fill(32));close(nodes.reduce((a,n)=>a+(n.x*n.x+n.y*n.y)*n.w,0),.5);
});
test('10. an all-fixed scene never moves',()=>{const bodies=[pt(1,1e-8,-1,0,true),pt(2,-1e-8,1,0,true)];assert.deepEqual(run(bodies,100).bodies,bodies);});
test('11. Reset restores initial positions and velocities without deleting objects',()=>{
  const bodies=S.clone(S.PRESETS.single.bodies),e=run(bodies,200);assert.notDeepEqual(e.bodies,bodies);e.reset();assert.deepEqual(e.bodies,bodies);assert.equal(e.time,0);assert.equal(e.status,'ready');assert.ok([...e.trails.values()].every(t=>t.length===2));
});
test('Pause keeps position and velocity; Resume continues from that state',()=>{const e=run([pt(1,0,0,0,false,1e-8,1,.2)],10),saved=S.clone(e.bodies),t=e.time;e.pause();assert.equal(e.step(),false);assert.deepEqual(e.bodies,saved);assert.equal(e.time,t);e.start();assert.ok(e.step());assert.ok(e.bodies[0].x>saved[0].x);});
test('12. camera zoom, pan and canvas resize preserve physical body coordinates',()=>{
  const bodies=S.clone(S.PRESETS.single.bodies),before=S.clone(bodies);let view={x:.25,y:-.4,scale:120};const a=P.screenToWorld(700,300,view,980,668);view=P.zoomAt(view,1.5,700,300,980,668);const b=P.screenToWorld(700,300,view,980,668);close(a.x,b.x);close(a.y,b.y);view.x+=.4;view.y-=.1;
  for(const [w,h]of [[980,668],[1280,800],[344,524]])for(const body of bodies){const s=P.worldToScreen(body.x,body.y,view,w,h),p=P.screenToWorld(s.x,s.y,view,w,h);close(p.x,body.x,1e-12);assert.ok(Math.abs(p.y-body.y)<1e-12);}assert.deepEqual(bodies,before);
});
function energyError(dt){const bodies=S.clone(S.PRESETS.single.bodies);bodies[1].vy=1.8;const engine=new S.Engine(bodies,{dt}),initial=S.energy(bodies),denom=initial.kinetic+Math.abs(initial.potential);let error=0;engine.start();for(let i=0;i<Math.round(2/dt);i++){assert.ok(engine.step(),engine.message);error=Math.max(error,Math.abs(S.energy(engine.bodies).total-initial.total)/denom);}return error;}
test('13. halving dt reduces maximum energy error by approximately four',t=>{
  const coarse=energyError(.008),medium=energyError(.004),fine=energyError(.002);assert.ok(medium<coarse*.3);assert.ok(fine<medium*.3);t.diagnostic(JSON.stringify({energyError:{dt008:coarse,dt004:medium,dt002:fine}}));
});
test('in-plane ring near-center field matches the analytic restoring slope',()=>{
  const ring=S.body(1,'Ring','ring',1e-8,0,0,true,1),x=.001,e=S.fieldAt(x,0,[ring],'high');close(e.x,-P.K*ring.q*x/(2*ring.radius**3),3e-6);assert.ok(Math.abs(e.y)<1e-12);
});
test('far fields of in-plane ring and disk approach the point-charge monopole',()=>{
  for(const type of ['ring','disk']){const b=S.body(1,type,type,1e-8,0,0,true,1),e=S.fieldAt(100,0,[b],'high'),monopole=P.K*b.q/10000;close(e.x,monopole,8e-5);assert.ok(Math.abs(e.y)<1e-14);}
});
function referenceDisk(x){let ex=0;const nr=128,nt=256;for(let j=0;j<nr;j++){const r=Math.sqrt((j+.5)/nr);for(let i=0;i<nt;i++){const angle=(i+.5)*2*Math.PI/nt,dx=x-r*Math.cos(angle),dy=-r*Math.sin(angle),d=Math.hypot(dx,dy);ex+=P.K*1e-8/(nr*nt)*dx/d/d/d;}}return ex;}
test('disk external in-plane field converges against independent dense area quadrature',t=>{
  const disk=S.body(1,'Disk','disk',1e-8,0,0,true,1),reference=referenceDisk(1.7),errors=['low','medium','high'].map(quality=>Math.abs(S.fieldAt(1.7,0,[disk],quality).x-reference)/reference);assert.ok(errors[1]<errors[0]);assert.ok(errors[2]<errors[1]);assert.ok(errors[2]<.0002);t.diagnostic(JSON.stringify({diskReference:reference,relativeError:errors}));
});
test('self-fields never accelerate an isolated free point, ring or disk',()=>{
  for(const type of ['point','ring','disk']){const b=S.body(1,type,type,1e-8,0,0,false,type==='point'?0:.4,1e-8,.1,0),e=run([b],50);assert.deepEqual(e.forces,[{x:0,y:0}]);close(e.bodies[0].vx,.1);assert.equal(S.fieldAt(b.x,b.y,[b],'medium',b.id).magnitude,0);}
});
test('free rigid ring/disk pair uses integrated external force and obeys action/reaction',()=>{
  const bodies=[S.body(1,'Ring','ring',1e-9,-2,.1,false,.45),S.body(2,'Disk','disk',-2e-9,2,.6,false,.5)],f=S.forces(bodies);assert.equal(f[0].x,-f[1].x);assert.equal(f[0].y,-f[1].y);
  const dx=1e-5,plus=S.clone(bodies),minus=S.clone(bodies);plus[0].x+=dx;minus[0].x-=dx;const gradient=-(S.energy(plus).potential-S.energy(minus).potential)/(2*dx);close(f[0].x,gradient,1e-7);
  const e=run(bodies,100);assert.ok(e.bodies[0].x>bodies[0].x);assert.ok(e.bodies[1].x<bodies[1].x);assert.equal(e.bodies[0].radius,.45);assert.equal(e.bodies[1].radius,.5);
});
test('two free point charges preserve total momentum and center-of-mass motion',()=>{
  const e=run(S.PRESETS.moving.bodies,500),[a,b]=e.bodies;assert.ok(Math.abs(a.mass*a.vx+b.mass*b.vx)<1e-22);assert.ok(Math.abs(a.mass*a.vy+b.mass*b.vy)<1e-22);assert.ok(Math.abs(a.x+b.x)<1e-12);assert.ok(Math.abs(a.y+b.y)<1e-12);
});
test('initial transverse velocity is retained; trajectories are not forced onto field lines',()=>{
  const e=run([pt(1,1e-9,0,0,true),pt(2,1e-9,1,0,false,1e-8,0,2)],25);assert.ok(e.bodies[1].y>.09);assert.ok(e.bodies[1].x>1);
});
test('simulation speed does not change fixed-step physical trajectories',()=>{const a=run(S.PRESETS.moving.bodies,100,{speed:.1}),b=run(S.PRESETS.moving.bodies,100,{speed:8});assert.deepEqual(a.bodies,b.bodies);assert.equal(a.time,b.time);});
test('geometric contact allows a point in a ring hole, but rejects charged material overlap',()=>{
  const ring=S.body(1,'Ring','ring',1e-8,0,0,true,1);assert.equal(S.contact([ring,pt(2,1e-9,0,0)],.015),'');assert.ok(S.contact([ring,pt(2,1e-9,1,0)],.015));
  const disk={...ring,type:'disk',name:'Disk'};assert.ok(S.contact([disk,pt(2,1e-9,0,0)],.015));assert.throws(()=>new S.Engine([pt(1,1e-9),pt(2,-1e-9,.01)]));
});
test('unsafe travel/tunneling and invalid dt pause before committing any corrupt state',()=>{
  const e=new S.Engine([pt(1,1e-9,0,0,true),pt(2,-1e-9,1,0,false,1e-8,-1000,0)]),saved=S.clone(e.bodies);e.start();assert.equal(e.step(.01),false);assert.equal(e.status,'paused');assert.deepEqual(e.bodies,saved);assert.equal(e.time,0);assert.ok(e.message.length>0);
  const n=new S.Engine([pt(1,0)]);n.start();assert.equal(n.step(.1),false);assert.equal(n.time,0);
});
test('invalid mass, radius, infinity, duplicate names and excessive quadrature work are rejected',()=>{
  for(const invalid of [{...pt(1,1),mass:0},{...pt(1,1),q:Infinity},{...pt(1,1),x:NaN},S.body(1,'Disk','disk',1e-9,0,0,true,-1)])assert.throws(()=>S.validateBodies([invalid]));
  assert.throws(()=>S.validateBodies([pt(1,0),{...pt(2,0,2),name:'q1'}]));
  const disks=[-4,0,4].map((x,i)=>S.body(i+1,`Disk ${i}`,'disk',1e-9,x,0,false,.4));assert.throws(()=>new S.Engine(disks,{quality:'high'}));
  for(const value of ['constructor','toString','__proto__']){assert.throws(()=>S.validateSettings({quality:value}));assert.throws(()=>S.validateSettings({fieldQuality:value}));assert.throws(()=>S.offsets(disks[0],value));}
});
test('all supplied presets can take 500 safe physical steps',()=>{for(const [name,preset]of Object.entries(S.PRESETS)){const e=run(preset.bodies,500);assert.ok(e.bodies.every(b=>[b.x,b.y,b.vx,b.vy].every(Number.isFinite)),name);}});
test('trails are bounded and clearing trails does not reset physical time or velocity',()=>{const e=run([pt(1,0,0,0,false,1e-8,1,.2)],12500),before=S.clone(e.bodies),time=e.time;assert.ok(e.trails.get(1).length<=2048);e.clearTrails();assert.equal(e.trails.get(1).length,2);assert.equal(e.time,time);assert.deepEqual(e.bodies,before);});
test('simulation JSON roundtrip preserves names, IDs, physical state, initial state and settings',()=>{
  const e=run(S.PRESETS.ring.bodies,20),view={x:.2,y:-.1,scale:140},data=JSON.parse(JSON.stringify(S.serialize(e,view))),valid=S.validateScene(data),restored=new S.Engine();restored.restore(valid);assert.deepEqual(restored.bodies,e.bodies);assert.deepEqual(restored.initial,e.initial);assert.equal(restored.time,e.time);assert.equal(restored.status,'paused');assert.deepEqual(valid.view,view);restored.reset();assert.deepEqual(restored.bodies,e.initial);
  assert.throws(()=>S.validateScene({version:1,charges:[]}));const bad=structuredClone(data);bad.initialBodies[0].id=99;assert.throws(()=>S.validateScene(bad));
});
test('dynamic field paths include inward negative-only arrows and finite ring/disk paths',()=>{
  for(const bodies of [[pt(1,-1e-9,0,0,true)],[S.body(1,'Ring','ring',1e-8,0,0,true,1)],[S.body(1,'Disk','disk',1e-8,0,0,true,1)]]){
    const data=F.generate({bodies,view:{x:0,y:0,scale:100},width:800,height:600,settings:S.DEFAULTS});assert.ok(data.lines.length>0);
    for(const line of data.lines){assert.ok(line.points.every(Number.isFinite));assert.ok(line.fields.every(Number.isFinite));if(bodies[0].q<0){const [x,y]=line.points,[,dx,dy]=line.fields;assert.ok(x*dx+y*dy<0);}}
  }
});
