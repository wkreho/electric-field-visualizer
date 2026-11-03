const {test}=require('node:test');
const assert=require('node:assert/strict');
const S=require('../js/simulation-physics.js'),H=require('../js/edit-history.js');
const view={x:0,y:0,scale:100};
const sample=()=>new S.Engine(S.PRESETS.single.bodies);
const snap=(e,id=2)=>H.capture(e,{selected:id,preset:'single'});
function roundtrip(e,apply,label='edit'){
  const h=new H.History(),before=snap(e);apply();const after=snap(e);assert.equal(h.record(label,before,after),true);
  h.undo(s=>H.restore(e,s,view));assert.deepEqual(snap(e),before);assert.notEqual(e.status,'running');
  h.redo(s=>H.restore(e,s,view));assert.deepEqual(snap(e),after);return h;
}
test('point, ring and disk additions retain stable identity through undo/redo',()=>{
  for(const type of ['point','ring','disk']){const e=sample();roundtrip(e,()=>e.replace([...e.bodies,S.body(3,'Added',type,1e-9,4,2,true,type==='point'?0:.5)]));}
});
test('delete, clear and whole preset replacement are reversible batch edits',()=>{
  for(const apply of [e=>e.replace(e.bodies.slice(0,1)),e=>e.replace([]),e=>e.replace(S.PRESETS.disk.bodies)]){const e=sample();const h=roundtrip(e,()=>apply(e));assert.equal(h.undoStack.length,1);}
});
test('name, charge, mass, radius, fixed/free, velocity and position edits roundtrip',()=>{
  for(const changes of [{name:'Renamed'},{q:2e-9},{mass:2e-8},{fixed:true},{vx:.1,vy:.2},{x:2,y:1},{type:'ring',radius:.3},{type:'disk',radius:.2}]){
    const e=sample();roundtrip(e,()=>e.replace(e.bodies.map(b=>b.id===2?{...b,...changes}:b)));
  }
  for(const type of ['ring','disk']){const e=new S.Engine([S.body(1,'Shape',type,1e-9,0,0,true,.5)]);roundtrip(e,()=>e.replace([{...e.bodies[0],radius:.9}]),'radius');}
});
test('a multi-update drag is one transaction and clicking without motion is a no-op',()=>{
  const e=sample(),h=new H.History(),before=snap(e);h.begin('Move',before);
  for(let i=1;i<=30;i++)e.replace(e.bodies.map(b=>b.id===2?{...b,x:1.5+i/100,vx:0,vy:0}:b));
  h.finish(snap(e));assert.equal(h.undoStack.length,1);h.undo(s=>H.restore(e,s,view));assert.deepEqual(snap(e),before);
  h.begin('Click',snap(e));assert.equal(h.finish(snap(e)),false);assert.equal(h.redoStack.length,1);
});
test('physics frames, Start/Pause/Reset never create history; undo while running restores initial and current states',()=>{
  const e=sample(),h=new H.History();e.start();for(let i=0;i<100;i++)assert.ok(e.step());e.pause();const before=snap(e);
  e.replace(e.bodies.map(b=>b.id===2?{...b,name:'Edited'}:b));const after=snap(e);h.record('Rename',before,after);
  e.start();for(let i=0;i<80;i++)assert.ok(e.step());assert.equal(h.undoStack.length,1);
  const meta=h.undo(s=>{const m=H.restore(e,s,view);assert.equal(m.selected,2);});assert.equal(meta,true);assert.deepEqual(snap(e),before);assert.equal(e.status,'paused');assert.deepEqual(e.forces,S.forces(e.bodies,e.settings.quality));
  e.start();assert.ok(e.step());h.redo(s=>H.restore(e,s,view));assert.deepEqual(snap(e),after);e.reset();assert.deepEqual(e.bodies,after.initialBodies);assert.equal(h.undoStack.length,1);
});
test('snapshots are isolated from caller mutations, failure is atomic, and new edits invalidate redo',()=>{
  const e=sample(),h=new H.History(),before=snap(e);e.replace(e.bodies.map(b=>({...b,name:b.name+'!'})));const after=snap(e);h.record('name',before,after);before.bodies[0].q=99;
  assert.throws(()=>h.undo(()=>{throw Error('reject');}));assert.equal(h.undoStack.length,1);assert.equal(h.redoStack.length,0);
  h.undo(s=>H.restore(e,s,view));assert.equal(e.bodies[0].q,1e-8);assert.equal(h.redoStack.length,1);
  const b=snap(e);e.replace(e.bodies.slice(0,1));h.record('delete',b,snap(e));assert.equal(h.redoStack.length,0);
});
test('history is bounded at 150 edits, and selection-only changes do not erase redo',()=>{
  const e=sample(),h=new H.History();for(let i=0;i<180;i++){const b=snap(e);e.replace(e.bodies.map(v=>({...v,name:v.id+'-'+i})));h.record('name',b,snap(e));}assert.equal(h.undoStack.length,150);
  h.undo(s=>H.restore(e,s,view));assert.equal(h.record('select',snap(e,1),snap(e,2)),false);assert.equal(h.redoStack.length,1);
});
test('restore preserves visual settings but recovers numerical profile for consistent forces',()=>{
  const e=sample(),before=snap(e);e.configure({quality:'high',dt:.004,showGrid:false,arrowSize:8});H.restore(e,before,view);assert.equal(e.settings.quality,'medium');assert.equal(e.settings.dt,.002);assert.equal(e.settings.showGrid,false);assert.equal(e.settings.arrowSize,8);
});
test('keyboard routes Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z and leaves native input editing untouched',()=>{
  const event={key:'z',ctrlKey:true,target:{closest:()=>null}};assert.equal(H.shortcut(event),'undo');assert.equal(H.shortcut({...event,shiftKey:true}),'redo');assert.equal(H.shortcut({...event,key:'y'}),'redo');assert.equal(H.shortcut({...event,ctrlKey:false} ),null);
  for(const target of [{closest:()=>({})},{isContentEditable:true,closest:()=>null}])assert.equal(H.shortcut({...event,target}),null);
});
test('legacy Visualizer JSON migrates to fixed points and retains styles; invalid imports leave engine intact',()=>{
  const e=sample(),before=snap(e);const legacy={version:1,charges:[{id:7,name:'Old',q:-1e-9,x:2,y:0}],view,settings:{lineDensity:64,arrowSize:7,showFieldControls:false}};
  const data=S.validateScene(legacy);assert.equal(data.bodies[0].fixed,true);assert.equal(data.bodies[0].id,7);assert.equal(data.settings.lineDensity,64);assert.equal(data.settings.showFieldControls,false);
  roundtrip(e,()=>e.restore(data),'Import');
  const bad={...legacy,charges:[{...legacy.charges[0],q:10}]};assert.throws(()=>e.restore(S.validateScene(bad)));assert.equal(e.bodies[0].name,'Old');
  assert.equal(before.bodies.length,2);
});
