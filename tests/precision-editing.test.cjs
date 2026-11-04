const {test}=require('node:test'),assert=require('node:assert/strict');
const S=require('../js/simulation-physics.js'),E=require('../js/simulation-editing.js'),H=require('../js/edit-history.js'),P=require('../js/physics.js');
const view={x:0,y:0,scale:100},pt=(id,x,y,q=1e-9,fixed=true)=>S.body(id,'Q'+id,'point',q,x,y,fixed);
function steps(e,n){e.start();for(let i=0;i<n;i++)assert.equal(e.step(),true,e.message);return e;}
function near(a,b,tol=1e-12){assert.ok(Math.abs(a-b)<=tol*Math.max(Math.abs(a),Math.abs(b),1e-100),`${a} != ${b}`);}
test('compensated sums retain an otherwise lost small summand',()=>{const s=new S.Sum();for(const x of [1e16,1,-1e16])s.add(x);assert.equal(s.value(),1);});
test('real tiny forces survive cancellation of large opposing forces without a zero threshold',()=>{
  const q=1e-30,bodies=[pt(1,0,0,1e-9,false),pt(2,1,0,1e-3),pt(3,2,0,q),pt(4,-1,0,1e-3)];
  const f=S.forces(bodies)[0];assert.notEqual(f.x,0);near(f.x,-P.K*1e-9*q/4);assert.equal(f.y,0);
});
test('every quadrature profile has exact x-axis reflection partners and the intended sample count',()=>{
  for(const type of ['ring','disk'])for(const quality of Object.keys(S.QUALITY)){const b=S.body(1,'Shape',type,1e-8,0,0,true,.73),nodes=S.offsets(b,quality),profile=S.QUALITY[quality];assert.equal(nodes.length,type==='ring'?profile.ring:profile.radial*profile.angular);for(const u of nodes)assert.ok(nodes.some(v=>v.x===u.x&&v.y===-u.y&&v.w===u.w));}
});
test('relative-center force calculation is invariant under a large exactly representable translation',()=>{
  const bodies=[S.body(1,'Ring','ring',1e-8,0,0,true,.5),pt(2,1.5,.25,1e-9,false)],a=S.forces(bodies,'high'),b=S.forces(bodies.map(b=>({...b,x:b.x+100000,y:b.y-100000})),'high');assert.deepEqual(a,b);
});
test('axis motion remains exactly y=vy=0 for ring/disk at all qualities with lock OFF and ON',()=>{
  for(const type of ['ring','disk'])for(const quality of Object.keys(S.QUALITY))for(const lock of [false,true]){
    const bodies=[S.body(1,'Shape',type,1e-8,0,0,true,1),pt(2,type==='ring'?.3:1.5,0,1e-9,false)],e=new S.Engine(bodies,{quality,preserveXAxisSymmetry:lock});steps(e,10000);assert.equal(e.bodies[1].y,0);assert.equal(e.bodies[1].vy,0);
  }
});
test('strict symmetry preserves moving reflection pairs, axis trajectories and their initial conditions',()=>{
  const bodies=[S.body(1,'Ring','ring',1e-9,-2,0,true,.5),{...pt(2,0,0,1e-10,false),mass:1e-6,vx:.1},{...pt(3,1,1,1e-10,false),mass:1e-6,vx:.05,vy:.02},{...pt(4,1,-1,1e-10,false),mass:1e-6,vx:.05,vy:-.02}];
  const e=new S.Engine(bodies,{preserveXAxisSymmetry:true});assert.equal(e.symmetry.active,true);steps(e,5000);assert.equal(e.symmetry.active,true);assert.equal(e.bodies[1].y,0);assert.equal(e.bodies[1].vy,0);assert.equal(e.bodies[2].x,e.bodies[3].x);assert.equal(e.bodies[2].y,-e.bodies[3].y);assert.equal(e.bodies[2].vy,-e.bodies[3].vy);e.reset();assert.deepEqual(e.bodies,S.validateBodies(bodies));
});
test('asymmetric scenes are bitwise identical with the optional setting ON or OFF',()=>{
  const bodies=[S.body(1,'Ring','ring',1e-8,0,1e-8,true,1),pt(2,.3,0,1e-9,false)],a=new S.Engine(bodies),b=new S.Engine(bodies,{preserveXAxisSymmetry:true});assert.equal(b.symmetry.active,false);assert.notEqual(b.forces[1].y,0);steps(a,1000);steps(b,1000);assert.deepEqual(a.bodies,b.bodies);assert.notEqual(b.bodies[1].y,0);
});
test('tiny real initial y/vy and mismatched reflected properties never activate symmetry',()=>{
  for(const changes of [{y:1e-30},{vy:1e-30}]){const e=new S.Engine([pt(1,-1,0),{...pt(2,1,0,1e-9,false),...changes}],{preserveXAxisSymmetry:true});assert.equal(e.symmetry.active,false);steps(e,1);assert.notEqual(e.bodies[1].y,0);}
  const original=[pt(1,0,1),pt(2,0,-1)];for(const changes of [{q:2e-9},{mass:2e-8},{type:'ring',radius:.2},{x:1e-30},{fixed:false}])assert.equal(new S.Engine([original[0],{...original[1],...changes}],{preserveXAxisSymmetry:true}).symmetry.active,false);
});
test('breaking current symmetry safely disables the constraint and recovers actual transverse force',()=>{
  const e=new S.Engine([pt(1,-1,0),pt(2,1,0,1e-9,false)],{preserveXAxisSymmetry:true});assert.equal(e.symmetry.active,true);e.bodies[0].y=.1;assert.equal(e.symmetry.active,false);steps(e,1);assert.notEqual(e.forces[1].y,0);assert.notEqual(e.bodies[1].y,0);
});
test('symmetry option defaults OFF, validates types, and roundtrips JSON and history restoration',()=>{
  const e=new S.Engine([pt(1,0,0)]);assert.equal(e.settings.preserveXAxisSymmetry,false);e.configure({preserveXAxisSymmetry:true});const data=S.validateScene(JSON.parse(JSON.stringify(S.serialize(e,view))));assert.equal(data.settings.preserveXAxisSymmetry,true);const snapshot=H.capture(e);e.configure({preserveXAxisSymmetry:false});H.restore(e,snapshot,view);assert.equal(e.settings.preserveXAxisSymmetry,true);assert.throws(()=>e.configure({preserveXAxisSymmetry:'true'}));
});
test('Shift toggle and group translation preserve IDs, spacing, charge and mass',()=>{
  let ids=[1];ids=E.toggle(ids,2);assert.deepEqual(ids,[1,2]);ids=E.toggle(ids,1);assert.deepEqual(ids,[2]);const bodies=[pt(1,0,0),pt(2,2,1)];const moved=E.translate(bodies,[1,2],.25,-.125);assert.equal(moved[1].x-moved[0].x,2);assert.equal(moved[1].y-moved[0].y,1);assert.equal(moved[0].q,bodies[0].q);assert.equal(moved[1].mass,bodies[1].mass);assert.deepEqual(E.selection(bodies,[2,2,4,1]),[2,1]);
});
test('copy includes rigid-body shape, mass, state and initial rather than evolved velocity',()=>{
  const bodies=[S.body(1,'Left','ring',1e-9,0,0,false,.25,2e-8,.1,.2),S.body(2,'Disk','disk',-1e-9,2,1,true,.3)];const current=S.clone(bodies);current[0].vx=99;const copied=E.copy(current,[1,2],bodies);assert.equal(copied[0].vx,.1);assert.equal(copied[0].radius,.25);assert.equal(copied[0].mass,2e-8);assert.equal(copied[1].type,'disk');copied[0].x=9;assert.equal(bodies[0].x,0);
});
test('paste allocates unique names/IDs and preserves exact relative shape through repeated placement',()=>{
  const bodies=[{...pt(1,0,0),name:'Left'},{...pt(2,2,1),name:'Left Copy'}],items=E.copy(bodies,[1,2]);const first=E.planPaste(items,bodies,S.DEFAULTS,{x:5,y:3}),clones=first.bodies.filter(b=>first.ids.includes(b.id));assert.equal(clones[1].x-clones[0].x,2);assert.equal(clones[1].y-clones[0].y,1);assert.equal(new Set(first.bodies.map(b=>b.id)).size,4);assert.equal(new Set(first.bodies.map(b=>b.name.toLowerCase())).size,4);assert.ok(clones.some(b=>b.name==='Left Copy 2'));const second=E.planPaste(items,first.bodies,S.DEFAULTS,{x:5,y:3},first.nextSerial);assert.equal(second.bodies.length,6);assert.equal(S.contact(second.bodies,S.DEFAULTS.collisionRadius),'');
});
test('Q names and forty-character custom names remain valid when copied',()=>{
  const bodies=[pt(1,0,0)],plan=E.planPaste(E.copy(bodies,[1]),bodies,S.DEFAULTS);assert.equal(plan.bodies[1].name,'Q2');const long={...bodies[0],name:'가'.repeat(40)},other=E.planPaste([long],[long],S.DEFAULTS);assert.ok(Array.from(other.bodies[1].name).length<=40);S.validateBodies(other.bodies);
});
test('paste failure at body, coordinate, collision search or sample limits is all-or-nothing',()=>{
  const bodies=Array.from({length:16},(_,i)=>pt(i+1,i*2,0)),before=JSON.stringify(bodies);assert.throws(()=>E.planPaste(E.copy(bodies,[1]),bodies,S.DEFAULTS));assert.equal(JSON.stringify(bodies),before);
  const edge=[pt(1,1e6,-1e6)];assert.throws(()=>E.planPaste(edge,edge,S.DEFAULTS,{x:1e6,y:-1e6}));assert.deepEqual(edge,[pt(1,1e6,-1e6)]);
  const shapes=[S.body(1,'Disk','disk',1e-9,0,0,true,.5),S.body(2,'Disk 2','disk',1e-9,2,0,true,.5)];assert.throws(()=>E.planPaste(shapes,shapes,{...S.DEFAULTS,fieldQuality:'high'},null,0));
});
test('group paste, delete and movement are one history entry and restore multi-selection',()=>{
  const e=new S.Engine([pt(1,0,0),pt(2,2,0)]),h=new H.History(),before=H.capture(e,{selection:[1,2]}),plan=E.planPaste(E.copy(e.bodies,[1,2]),e.bodies,e.settings);e.replace(plan.bodies);h.record('Paste group',before,H.capture(e,{selection:plan.ids}));assert.equal(h.undoStack.length,1);let restored;h.undo(s=>restored=H.restore(e,s,view));assert.equal(e.bodies.length,2);assert.deepEqual(restored.selection,[1,2]);h.redo(s=>restored=H.restore(e,s,view));assert.equal(e.bodies.length,4);assert.deepEqual(restored.selection,plan.ids);
  const b=H.capture(e,{selection:plan.ids});e.replace(e.bodies.filter(b=>!plan.ids.includes(b.id)));h.record('Delete group',b,H.capture(e));h.undo(s=>restored=H.restore(e,s,view));assert.equal(e.bodies.length,4);assert.deepEqual(restored.selection,plan.ids);
});
test('probe uses analytic Coulomb values and atan2, handles singularities, and rejects bad coordinates',()=>{
  const bodies=[pt(1,0,0)],before=JSON.stringify(bodies),value=E.probe('1','0',bodies,'medium');near(value.ex,P.K*1e-9);assert.equal(value.ey,0);assert.equal(value.direction,0);assert.equal(E.probe(0,1,bodies,'medium').direction,90);assert.equal(E.probe(0,0,bodies,'medium').singular,true);assert.equal(E.probe(0,0,bodies,'medium').ex,null);for(const x of ['', 'NaN','Infinity','1e999','1e7','1e-999'])assert.throws(()=>E.probe(x,0,bodies,'low'));assert.equal(JSON.stringify(bodies),before);
});
test('ring/disk probes use the same quadrature as the engine; input focus retains native shortcuts',()=>{
  for(const type of ['ring','disk']){const bodies=[S.body(1,'Shape',type,1e-8,0,0,true,1)],e=S.fieldAt(2,.5,bodies,'high'),probe=E.probe(2,.5,bodies,'high');assert.equal(probe.ex,e.x);assert.equal(probe.ey,e.y);near(probe.magnitude,e.magnitude);}
  assert.equal(E.textEditing({closest:()=>({})}),true);assert.equal(E.textEditing({isContentEditable:true}),true);assert.equal(E.textEditing({closest:()=>null}),false);
});

test('an invalid group translation leaves every body and the pending history unchanged',()=>{
  const e=new S.Engine([pt(1,0,0),pt(2,2,0),pt(3,5,0)]),h=new H.History(),before=H.capture(e,{selection:[1,2]});h.begin('Group move',before);assert.throws(()=>e.replace(E.translate(e.bodies,[1,2],3,0)));assert.deepEqual(H.capture(e,{selection:[1,2]}),before);assert.equal(h.finish(before),false);assert.equal(h.undoStack.length,0);
});
