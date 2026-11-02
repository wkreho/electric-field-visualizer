(function(root) {
  'use strict';
  const P = root.EFPhysics || (typeof require !== 'undefined' && require('./physics.js'));
  function rk4(x,y,h,sign,charges) {
    const direction = (a,b) => { const e=P.fieldAt(a,b,charges); return [sign*e.dx,sign*e.dy]; };
    const a=direction(x,y); if (!a[0] && !a[1]) return null;
    const b=direction(x+a[0]*h/2,y+a[1]*h/2), c=direction(x+b[0]*h/2,y+b[1]*h/2), d=direction(x+c[0]*h,y+c[1]*h);
    if ((!b[0]&&!b[1]) || (!c[0]&&!c[1]) || (!d[0]&&!d[1])) return null;
    return {x:x+h*(a[0]+2*b[0]+2*c[0]+d[0])/6, y:y+h*(a[1]+2*b[1]+2*c[1]+d[1])/6};
  }
  function radii(charges,scale) {
    return charges.map((c,i) => {
      let radius=13/scale;
      charges.forEach((other,j)=> { const d=Math.hypot(c.x-other.x,c.y-other.y); if(i!==j && d>0) radius=Math.min(radius,d*.18); });
      return Math.max(radius,Number.EPSILON*Math.max(1,Math.abs(c.x),Math.abs(c.y))*8);
    });
  }
  function trace(seed, sign, charges, capture, bounds, scale, sourceIndex) {
    const points=[seed.x,seed.y]; let x=seed.x,y=seed.y,length=0,end=-1;
    const maxLength=Math.hypot(bounds.right-bounds.left,bounds.top-bounds.bottom)*5;
    for(let step=0;step<2200;step++) {
      let nearest=Infinity;
      for(let i=0;i<charges.length;i++) {
        const c=charges[i]; if(!c.q) continue;
        const d=Math.hypot(x-c.x,y-c.y);
        if(d<=capture[i] && (i!==sourceIndex || step>4)) return {points,sign,end:i};
        nearest=Math.min(nearest,d);
      }
      const e=P.fieldAt(x,y,charges); if(!e.dx&&!e.dy) break;
      let h=Math.min(6/scale,nearest*.24), next=null;
      // Step-doubling error estimate resolves high-curvature and near-null regions.
      for(let attempt=0;attempt<6;attempt++) {
        const full=rk4(x,y,h,sign,charges), half=rk4(x,y,h/2,sign,charges);
        const twice=half&&rk4(half.x,half.y,h/2,sign,charges);
        if(!full||!twice) { h*=.5;continue; }
        if(Math.hypot(full.x-twice.x,full.y-twice.y)*scale>.06) {h*=.5;continue;}
        next=twice;break;
      }
      if(!next || !Number.isFinite(next.x) || !Number.isFinite(next.y)) break;
      const ds=Math.hypot(next.x-x,next.y-y); if(ds*scale<1e-6) break;
      x=next.x;y=next.y;length+=ds;points.push(x,y);
      if(x<bounds.left || x>bounds.right || y<bounds.bottom || y>bounds.top || length>maxLength) break;
    }
    return {points,sign,end};
  }
  function generate({charges,view,width,height,settings}) {
    const started=typeof performance!=='undefined'?performance.now():Date.now();
    // Exactly coincident sources are physically one source. Retain originals in the editor.
    const grouped=new Map();
    for(const c of charges) { const key=`${c.x},${c.y}`; if(grouped.has(key)) grouped.get(key).q+=c.q; else grouped.set(key,{...c}); }
    charges=[...grouped.values()].filter(c=>c.q!==0);
    if(!charges.length) return {lines:[],logMin:0,logMax:1,ms:0};
    const scale=view.scale,capture=radii(charges,scale), margin=35/scale;
    const bounds={left:view.x-width/2/scale-margin,right:view.x+width/2/scale+margin,bottom:view.y-height/2/scale-margin,top:view.y+height/2/scale+margin};
    const maxQ=Math.max(...charges.map(c=>Math.abs(c.q)));
    const counts=charges.map(c=>Math.max(6,Math.round(settings.lineDensity*Math.abs(c.q)/maxQ)));
    const total=counts.reduce((a,b)=>a+b,0), budget=640;
    if(total>budget) for(let i=0;i<counts.length;i++) counts[i]=Math.max(3,Math.floor(counts[i]*budget/total));
    const lines=[];
    const visibleSource=charges.some(c=>c.x>=bounds.left&&c.x<=bounds.right&&c.y>=bounds.bottom&&c.y<=bounds.top);
    for(let index=0;index<charges.length;index++) {
      const c=charges[index],sign=c.q>0?1:-1,count=counts[index];
      for(let j=0;j<count;j++) {
        const angle=(j+.5)*2*Math.PI/count, radius=capture[index]*1.1;
        const line=trace({x:c.x+Math.cos(angle)*radius,y:c.y+Math.sin(angle)*radius},sign,charges,capture,bounds,scale,index);
        // Positive sources already provide these connecting paths. Reverse traces
        // supply incoming flux from infinity, including the negative-only case.
        if(sign<0 && line.end>=0 && charges[line.end].q>0) continue;
        if(line.points.length>=6 && visibleSource) {line.source=c.id;lines.push(line);}
      }
    }
    // With every source offscreen, sample incoming boundary flux. This keeps
    // panning/zooming into a source-free portion of the field useful.
    if(!visibleSource){
      const candidates=[],sideSamples=Math.max(16,settings.lineDensity),inset=.1/scale;
      for(let side=0;side<4;side++)for(let j=0;j<sideSamples;j++){
        const t=(j+.5)/sideSamples;
        const seed=side===0?{x:bounds.left+inset,y:bounds.bottom+t*(bounds.top-bounds.bottom)}:side===1?{x:bounds.right-inset,y:bounds.bottom+t*(bounds.top-bounds.bottom)}:side===2?{x:bounds.left+t*(bounds.right-bounds.left),y:bounds.bottom+inset}:{x:bounds.left+t*(bounds.right-bounds.left),y:bounds.top-inset};
        const e=P.fieldAt(seed.x,seed.y,charges),incoming=side===0?e.dx:side===1?-e.dx:side===2?e.dy:-e.dy;
        if(incoming>.03)candidates.push(seed);
      }
      const stride=Math.max(1,Math.ceil(candidates.length/(settings.lineDensity*2)));
      for(let i=0;i<candidates.length;i+=stride){const line=trace(candidates[i],1,charges,capture,bounds,scale,-1);if(line.points.length>=6)lines.push(line);}
    }
    const logs=[];
    for(let ix=0;ix<18;ix++) for(let iy=0;iy<14;iy++) {
      const x=bounds.left+(ix+.5)/18*(bounds.right-bounds.left), y=bounds.bottom+(iy+.5)/14*(bounds.top-bounds.bottom);
      if(charges.some((c,i)=>Math.hypot(x-c.x,y-c.y)<capture[i]*1.5)) continue;
      const e=P.fieldAt(x,y,charges).magnitude;
      if(e>0&&Number.isFinite(e)) logs.push(Math.log10(e));
    }
    logs.sort((a,b)=>a-b);
    const logMin=logs[Math.floor(logs.length*.05)]??0, logMax=Math.max(logMin+.01,logs[Math.floor(logs.length*.95)]??1);
    return {lines,logMin,logMax,ms:(typeof performance!=='undefined'?performance.now():Date.now())-started};
  }
  function arrowSpacing(magnitude,logMin,logMax,density) {
    const t=magnitude>0?Math.max(0,Math.min(1,(Math.log10(magnitude)-logMin)/Math.max(.01,logMax-logMin))):0;
    return Math.max(22,Math.min(180,(115-82*t)/density));
  }
  const api={rk4,radii,trace,generate,arrowSpacing}; root.EFLines=api;
  if(typeof module!=='undefined') module.exports=api;
})(typeof self!=='undefined'?self:globalThis);
