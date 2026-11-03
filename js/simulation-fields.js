(function(root){
  'use strict';
  const P=root.EFPhysics||(typeof require!=='undefined'&&require('./physics.js'));
  const L=root.EFLines||(typeof require!=='undefined'&&require('./fieldLines.js'));
  const S=root.EFSimulation||(typeof require!=='undefined'&&require('./simulation-physics.js'));
  function materialDistance(x,y,b){const d=Math.hypot(x-b.x,y-b.y);return b.type==='point'?d:b.type==='ring'?Math.abs(d-b.radius):Math.max(0,d-b.radius);}
  function generate({bodies,view,width,height,settings}){
    const start=performance.now(),nodes=S.samples(bodies,settings.fieldQuality);
    if(nodes.length>512)throw new Error('Field 샘플이 512개를 초과합니다. Field 품질을 낮추세요.');
    if(!nodes.length)return {lines:[],logMin:0,logMax:1,ms:0};
    const scale=view.scale,bounds={left:view.x-(width/2+24)/scale,right:view.x+(width/2+24)/scale,bottom:view.y-(height/2+24)/scale,top:view.y+(height/2+24)/scale};
    const sources=bodies.filter(b=>b.q!==0),maxQ=Math.max(...sources.map(b=>Math.abs(b.q)));
    const counts=sources.map(b=>Math.max(6,Math.round(settings.lineDensity*Math.abs(b.q)/maxQ))),total=counts.reduce((a,b)=>a+b,0);
    if(total>160)counts.forEach((n,i)=>counts[i]=Math.max(3,Math.floor(n*160/total)));
    const lines=[],logs=[];let operations=0;
    function trace(seed,sign,source){
      let x=seed.x,y=seed.y;const points=[x,y];let end=-1;
      for(let step=0;step<650&&operations<32000;step++,operations++){
        let nearest=Infinity;
        for(let i=0;i<bodies.length;i++)if(bodies[i].q){const d=materialDistance(x,y,bodies[i]);if(d<4/scale&&(bodies[i].id!==source.id||step>3)){end=i;return {points,sign,end};}nearest=Math.min(nearest,d);}
        const e=P.fieldAt(x,y,nodes);if(!e.dx&&!e.dy)break;
        let h=Math.min(6/scale,Math.max(.08/scale,nearest*.23)),next=null;
        for(let attempt=0;attempt<5;attempt++){
          const full=L.rk4(x,y,h,sign,nodes),half=L.rk4(x,y,h/2,sign,nodes),twice=half&&L.rk4(half.x,half.y,h/2,sign,nodes);
          if(!full||!twice||Math.hypot(full.x-twice.x,full.y-twice.y)*scale>.08){h*=.5;continue;}next=twice;break;
        }
        if(!next||!Number.isFinite(next.x)||!Number.isFinite(next.y)||Math.hypot(next.x-x,next.y-y)*scale<1e-4)break;
        const en=P.fieldAt(next.x,next.y,nodes);if(e.dx*en.dx+e.dy*en.dy<-.3)break;
        x=next.x;y=next.y;points.push(x,y);
        if(x<bounds.left||x>bounds.right||y<bounds.bottom||y>bounds.top)break;
      }
      return {points,sign,end};
    }
    for(let i=0;i<sources.length;i++){
      const b=sources[i],count=counts[i],sign=b.q>0?1:-1;
      const pad=Math.max(8/scale,Math.min(.07,b.radius*.12||.07));
      const rings=b.type==='ring'&&b.radius>pad*2?[b.radius+pad,b.radius-pad]:[b.type==='point'?12/scale:b.radius+pad];
      for(const radius of rings)for(let j=0;j<count;j++){
        const angle=(j+.5)*2*Math.PI/count,line=trace({x:b.x+Math.cos(angle)*radius,y:b.y+Math.sin(angle)*radius},sign,b);
        if(sign<0&&line.end>=0&&bodies[line.end].q>0)continue;
        if(line.points.length<6)continue;
        // Precompute actual E for arrow rendering off the UI thread.
        line.fields=[];
        for(let k=0;k<line.points.length;k+=2){const e=P.fieldAt(line.points[k],line.points[k+1],nodes);line.fields.push(e.magnitude,e.dx,e.dy);}
        lines.push(line);
      }
    }
    // Supply incoming field paths when all distributions are offscreen.
    if(!lines.length){
      for(let side=0;side<4;side++)for(let j=0;j<12;j++){
        const t=(j+.5)/12,seed=side<2?{x:side===0?bounds.left+.1/scale:bounds.right-.1/scale,y:bounds.bottom+t*(bounds.top-bounds.bottom)}:{x:bounds.left+t*(bounds.right-bounds.left),y:side===2?bounds.bottom+.1/scale:bounds.top-.1/scale};
        const e=P.fieldAt(seed.x,seed.y,nodes),incoming=side===0?e.dx:side===1?-e.dx:side===2?e.dy:-e.dy;if(incoming<.1)continue;
        const line=trace(seed,1,{id:-1});if(line.points.length<6)continue;line.fields=[];
        for(let k=0;k<line.points.length;k+=2){const f=P.fieldAt(line.points[k],line.points[k+1],nodes);line.fields.push(f.magnitude,f.dx,f.dy);}lines.push(line);
      }
    }
    for(let x=0;x<16;x++)for(let y=0;y<12;y++){
      const px=bounds.left+(x+.5)/16*(bounds.right-bounds.left),py=bounds.bottom+(y+.5)/12*(bounds.top-bounds.bottom);
      if(bodies.some(b=>materialDistance(px,py,b)<8/scale))continue;
      const e=P.fieldAt(px,py,nodes).magnitude;if(e>0&&Number.isFinite(e))logs.push(Math.log10(e));
    }
    logs.sort((a,b)=>a-b);const logMin=logs[Math.floor(logs.length*.05)]??0,logMax=Math.max(logMin+.01,logs[Math.floor(logs.length*.95)]??1);
    return {lines,logMin,logMax,ms:performance.now()-start};
  }
  root.EFSimulationFields={generate,materialDistance};if(typeof module!=='undefined')module.exports=root.EFSimulationFields;
})(typeof self!=='undefined'?self:globalThis);
