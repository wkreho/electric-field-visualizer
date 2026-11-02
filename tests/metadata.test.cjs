const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const P=require('../js/physics.js'),L=require('../js/fieldLines.js');
const named=(id,name)=>({id,name,x:id,y:0,q:1e-9});
const scene=charges=>({version:1,charges,view:{x:.5,y:-.25,scale:105},settings:{...P.DEFAULTS}});

test('names reuse the smallest available Q number, independent of internal IDs',()=>{
  assert.equal(P.nextChargeName([]),'Q1');
  assert.equal(P.nextChargeName([named(71,'Q1'),named(99,'Q3')]),'Q2');
  assert.equal(P.nextChargeName([named(1,'Left Charge'),named(2,'Q2')]),'Q1');
  assert.equal(P.nextChargeName([named(42,'q1'),named(5,'Q2')]),'Q3');
});
test('renaming preserves ID and rejects empty, duplicate, multiline and oversized names',()=>{
  const charges=[named(101,'Q1'),named(202,'Right Charge')];
  assert.equal(P.validateName('  Left   Charge  ',charges,101),'Left Charge');
  assert.equal(P.validateName('Q1',charges,101),'Q1');
  for(const name of ['','  ','right charge','a\nb','x'.repeat(41)])assert.throws(()=>P.validateName(name,charges,101));
  assert.equal(P.validateName('양전하 A',charges,101),'양전하 A');
  assert.equal(charges[0].id,101);
});
test('legacy version-1 JSON without names or field-control setting receives safe defaults',()=>{
  const old=require('../artifacts/sample-scene.json');
  const data=P.validateScene(old);assert.deepEqual(data.charges.map(c=>c.name),['Q1','Q2']);
  assert.equal(data.settings.showFieldControls,true);
  assert.deepEqual(data.charges.map(({name,...c})=>c),old.charges);
  assert.deepEqual(data.view,old.view);
});
test('mixed old and new records reserve explicit names and IDs before assigning defaults',()=>{
  const input=scene([{x:0,y:0,q:1},{id:9,name:'Q1',x:1,y:0,q:-1},{id:2,x:2,y:0,q:0}]);
  const data=P.validateScene(input);assert.deepEqual(data.charges.map(c=>c.name),['Q2','Q1','Q3']);
  assert.equal(new Set(data.charges.map(c=>c.id)).size,3);assert.equal(data.charges[1].id,9);assert.equal(data.charges[2].id,2);
});
test('new JSON roundtrips names, stable IDs and independent control visibility',()=>{
  const input=scene([named(17,'Left Charge'),named(85,'Right Charge')]);
  input.settings={...P.DEFAULTS,showArrows:true,showGrid:false,showFieldControls:false};
  assert.deepEqual(P.validateScene(JSON.parse(JSON.stringify(input))),{charges:input.charges,view:input.view,settings:input.settings});
});
test('ambiguous imported names and IDs are rejected before modifying a scene',()=>{
  for(const charges of [[named(1,'Left'),named(2,'left')],[named(1,'')],[named(1,'A'),named(1,'B')],[named(0,'A')],[{...named(1,'A'),name:null}]])assert.throws(()=>P.validateScene(scene(charges)));
  assert.throws(()=>P.validateScene({...scene([]),settings:{showFieldControls:'false'}}));
});
test('custom display names do not affect the physical vector',()=>{
  const charges=[named(17,'Left Charge'),{...named(85,'Right Charge'),q:-3e-9}];
  for(const [x,y]of [[0,0],[.5,1],[-2,3]])assert.deepEqual(P.fieldAt(x,y,charges),P.fieldAt(x,y,charges.map(({name,...c})=>c)));
});
test('all five presets match their pre-update numerical line samples',()=>{
  const baseline=require('./fixtures/field-baseline.json');
  const presets={positive:[[0,0,1e-9]],negative:[[0,0,-1e-9]],dipole:[[-1,0,1e-9],[1,0,-1e-9]],like:[[-1,0,1e-9],[1,0,1e-9]],unequal:[[-1,0,1e-9],[1,0,-3e-9]]};
  for(const [name,raw]of Object.entries(presets)){
    const charges=raw.map(([x,y,q],i)=>({id:i+1,name:`Custom ${i+1}`,x,y,q}));
    const data=L.generate({charges,view:{x:0,y:0,scale:100},width:1000,height:650,settings:P.DEFAULTS});
    const numeric=data.lines.map(l=>({sign:l.sign,end:l.end,points:l.points.map(n=>Number(n.toFixed(7)))}));
    const hash=crypto.createHash('sha256').update(JSON.stringify(numeric)).digest('hex');
    assert.equal(data.lines.length,baseline[name].count,name+' count');assert.equal(hash,baseline[name].sha256,name+' geometry');
  }
});
