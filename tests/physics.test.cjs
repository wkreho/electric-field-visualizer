// Run: node --test tests/physics.test.cjs (Node 18+). No packages required.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const P=require('../js/physics.js'),L=require('../js/fieldLines.js');
const charge=(x,y,q,id=1)=>({x,y,q,id});
const scene=charges=>({charges,view:{x:0,y:0,scale:100},width:1000,height:650,settings:{...P.DEFAULTS}});
const close=(actual,expected,tol=1e-9)=>assert.ok(Math.abs(actual-expected)<=tol*Math.max(1,Math.abs(expected)),`${actual} ≠ ${expected}`);
function finiteLines(data){assert.ok(data.lines.every(l=>l.points.length<=4402&&l.points.every(Number.isFinite)));}

test('A: single positive is radial, with the analytic Coulomb magnitude',()=>{
  const charges=[charge(0,0,1e-9)],e=P.fieldAt(3,4,charges);close(e.magnitude,P.K*1e-9/25);close(e.dx,.6);close(e.dy,.8);
  const data=L.generate(scene(charges));assert.equal(data.lines.length,32);
  for(const l of data.lines){assert.equal(l.sign,1);const p=l.points;assert.ok(Math.hypot(p.at(-2),p.at(-1))>Math.hypot(p[0],p[1]));close(p[0]*p.at(-1)-p[1]*p.at(-2),0,1e-7);}finiteLines(data);
});
test('B: negative-only scene generates inward-directed lines',()=>{
  const charges=[charge(0,0,-1e-9)],data=L.generate(scene(charges));assert.equal(data.lines.length,32);
  for(const l of data.lines){assert.equal(l.sign,-1);const x=l.points[0],y=l.points[1],e=P.fieldAt(x,y,charges);assert.ok(x*e.dx+y*e.dy<0);assert.ok(Math.hypot(l.points.at(-2),l.points.at(-1))>Math.hypot(x,y));}finiteLines(data);
});
test('C: dipole midpoint points from positive to negative and traced segments follow E',()=>{
  const charges=[charge(-1,0,1e-9),charge(1,0,-1e-9,2)],e=P.fieldAt(0,0,charges);close(e.x,2*P.K*1e-9);close(e.y,0);assert.equal(e.dx,1);
  const data=L.generate(scene(charges));assert.ok(data.lines.some(l=>l.sign===1&&l.end===1));
  for(const l of data.lines)for(let i=2;i<l.points.length;i+=20){const x=l.points[i],y=l.points[i+1],px=l.points[i-2],py=l.points[i-1],v=P.fieldAt((x+px)/2,(y+py)/2,charges);const dot=((x-px)*v.dx+(y-py)*v.dy)*l.sign;assert.ok(dot>=-1e-10);}
  finiteLines(data);
});
test('D: equal positive charges cancel at their midpoint without NaN',()=>{
  const charges=[charge(-1,0,1e-9),charge(1,0,1e-9,2)],e=P.fieldAt(0,0,charges);close(e.magnitude,0);assert.equal(e.dx,0);assert.equal(e.dy,0);finiteLines(L.generate(scene(charges)));
});
test('E: charge scaling and inverse-square distance follow Coulomb law',()=>{
  const a=P.fieldAt(2,0,[charge(0,0,1e-9)]),b=P.fieldAt(2,0,[charge(0,0,3.5e-9)]),c=P.fieldAt(4,0,[charge(0,0,1e-9)]);close(b.magnitude/a.magnitude,3.5);close(a.magnitude/c.magnitude,4);
});
test('F: transforms round-trip and cursor-centered zoom preserves world coordinates',()=>{
  for(const view of [{x:0,y:0,scale:130},{x:174,y:-67,scale:.00001},{x:-.4,y:1.8,scale:1e6}]){
    const before={x:.75,y:-1.25},s=P.worldToScreen(before.x,before.y,view,1200,800),back=P.screenToWorld(s.x,s.y,view,1200,800);close(back.x,before.x,1e-7);close(back.y,before.y,1e-7);
    const point=P.screenToWorld(321,167,view,1200,800),zoom=P.zoomAt(view,1.35,321,167,1200,800),after=P.screenToWorld(321,167,zoom,1200,800);close(after.x,point.x);close(after.y,point.y);
  }
});
test('zero charge, empty scenes and coincident opposite charges produce no spurious lines',()=>{
  for(const charges of [[],[charge(0,0,0)],[charge(0,0,1e-9),charge(0,0,-1e-9,2)]])assert.equal(L.generate(scene(charges)).lines.length,0);
  assert.equal(P.fieldAt(0,0,[charge(0,0,0)]).magnitude,0);
});
test('singular points are identified, nearby sources and null regions terminate safely',()=>{
  assert.equal(P.fieldAt(0,0,[charge(0,0,1e-9)]).singular,true);
  for(const separation of [1e-3,1e-8,1e-14])finiteLines(L.generate(scene([charge(0,0,1e-9),charge(separation,0,-1e-9,2)])));
});
test('unequal charges have incoming flux from infinity and retain weak-source seeds',()=>{
  const data=L.generate(scene([charge(-1,0,1e-9),charge(1,0,-3e-9,2)]));assert.ok(data.lines.some(l=>l.sign===-1&&l.end===-1));
  const extreme=L.generate(scene([charge(-1,0,1e-24),charge(1,0,1e-3,2)]));assert.ok(extreme.lines.some(l=>l.source===1));assert.ok(extreme.lines.filter(l=>l.source===2).length>extreme.lines.filter(l=>l.source===1).length);finiteLines(extreme);
});
test('direction is invariant for tiny nonzero charge, rather than using an absolute field threshold',()=>{
  const tiny=P.fieldAt(1,1,[charge(0,0,1e-280)]);close(tiny.dx,Math.SQRT1_2);close(tiny.dy,Math.SQRT1_2);assert.ok(tiny.magnitude>0);
});
test('a camera panned away from every source still displays physical field lines',()=>{
  const input=scene([charge(0,0,1e-9)]);input.view.x=20;const data=L.generate(input);assert.ok(data.lines.length>0);finiteLines(data);
  for(const line of data.lines){assert.equal(line.sign,1);assert.ok(line.points.at(-2)>line.points[0]);}
});
test('arrow spacing gets denser as actual field strength rises and stays bounded',()=>{
  const weak=L.arrowSpacing(1,0,4,1),strong=L.arrowSpacing(1e4,0,4,1);assert.ok(strong<weak);
  for(const q of [0,1e-300,1,1e300])for(const density of [.4,1,2]){const n=L.arrowSpacing(q,0,4,density);assert.ok(n>=22&&n<=180);}
});
test('numeric inputs reject malformed, infinite, blank, overflow and underflow values',()=>{
  for(const input of ['',' ','NaN','Infinity','1e999','2x','0x10','1,2','1e-999'])assert.throws(()=>P.parseNumber(input,1e6,'q'));
  for(const input of ['1e-9','-2e-9','3.5e-6','-0.001','.5','0'])assert.equal(P.parseNumber(input,1e6,'q'),Number(input));
});
test('JSON roundtrip preserves physical values, camera and all visualization settings',()=>{
  const data={version:1,charges:[{...charge(-1,2,-3.5e-6),name:'Left Charge'}],view:{x:.8,y:-.4,scale:172},settings:{...P.DEFAULTS,showArrows:false,lineWidth:2.3}};
  const back=P.validateScene(JSON.parse(JSON.stringify(data)));assert.deepEqual(back.charges,data.charges);assert.deepEqual(back.view,data.view);assert.deepEqual(back.settings,data.settings);
  for(const invalid of [{...data,version:2},{...data,charges:[{x:0,y:0,q:'NaN'}]},{...data,view:{x:0,y:0,scale:0}},{...data,settings:{arrowDensity:Infinity}},{...data,charges:[{x:1e10,y:0,q:1}]}])assert.throws(()=>P.validateScene(invalid));
});
test('20-charge benchmark is bounded, finite, and honors the global line budget',t=>{
  const charges=Array.from({length:20},(_,i)=>{const a=i/20*Math.PI*2;return charge(Math.cos(a)*2,Math.sin(a)*2,(i%2?1:-1)*1e-9,i+1);});
  const start=performance.now(),data=L.generate(scene(charges)),elapsed=performance.now()-start;assert.ok(data.lines.length<=640);finiteLines(data);t.diagnostic(`20 sources, ${data.lines.length} lines, ${elapsed.toFixed(1)} ms on this host`);assert.ok(elapsed<15000);
});
