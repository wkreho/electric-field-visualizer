(function(root) {
  'use strict';
  const P=root.EFPhysics,L=root.EFLines;
  function niceStep(scale) {
    const raw=85/scale, power=10**Math.floor(Math.log10(raw)), n=raw/power;
    return (n<1.5?1:n<3.5?2:n<7.5?5:10)*power;
  }
  function tickLabel(n,step) {if(Math.abs(n)<step*1e-6)return '0';return Math.abs(n)>=1e5||Math.abs(n)<.001?n.toExponential(1):Number(n.toFixed(Math.max(0,-Math.floor(Math.log10(step))))).toString();}
  class Renderer {
    constructor(canvas) {this.canvas=canvas;this.ctx=canvas.getContext('2d');this.back=document.createElement('canvas');this.bg=this.back.getContext('2d');this.width=0;this.height=0;this.dpr=1;this.data={lines:[],logMin:0,logMax:1};}
    resize() {
      const box=this.canvas.getBoundingClientRect();this.width=box.width;this.height=box.height;this.dpr=Math.min(window.devicePixelRatio||1,3);
      for(const c of [this.canvas,this.back]) {c.width=Math.round(this.width*this.dpr);c.height=Math.round(this.height*this.dpr);}
      this.ctx.setTransform(this.dpr,0,0,this.dpr,0,0);this.bg.setTransform(this.dpr,0,0,this.dpr,0,0);
    }
    project(x,y,view){return P.worldToScreen(x,y,view,this.width,this.height);}
    drawBackground(state) {
      const ctx=this.bg,w=this.width,h=this.height,view=state.view;
      ctx.clearRect(0,0,w,h);ctx.fillStyle='#0e151e';ctx.fillRect(0,0,w,h);
      if(state.settings.showGrid)this.grid(ctx,view);
      const data=this.data;ctx.lineWidth=state.settings.lineWidth;ctx.lineJoin='round';ctx.lineCap='round';
      ctx.strokeStyle='rgba(157,215,194,.56)';
      // No curve fitting: closely spaced RK4 samples preserve the field tangent.
      ctx.beginPath();
      for(const line of data.lines) {
        for(let i=0;i<line.points.length;i+=2) {const p=this.project(line.points[i],line.points[i+1],view);if(i===0)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);}
      }
      ctx.stroke();
      if(state.settings.showArrows) {
        ctx.strokeStyle='rgba(188,235,214,.88)';ctx.lineWidth=Math.max(.85,state.settings.lineWidth*.85);
        // A small spatial hash prevents arrows from adjacent lines piling up.
        const occupied=new Set(),cell=Math.max(8,state.settings.arrowSize*2.1);
        ctx.beginPath();
        for(const line of data.lines) {
          let phase=.32;
          for(let i=2;i<line.points.length;i+=2) {
            const x=line.points[i],y=line.points[i+1],prevX=line.points[i-2],prevY=line.points[i-1];
            const ds=Math.hypot(x-prevX,y-prevY)*view.scale;
            const e=P.fieldAt(x,y,state.charges), spacing=L.arrowSpacing(e.magnitude,data.logMin,data.logMax,state.settings.arrowDensity);
            phase+=ds/spacing;if(phase<1)continue;phase%=1;
            const p=this.project(x,y,view);if(p.x<12||p.x>w-12||p.y<12||p.y>h-12||(!e.dx&&!e.dy))continue;
            if(state.charges.some(c=>Math.hypot(x-c.x,y-c.y)*view.scale<23))continue;
            const gx=Math.floor(p.x/cell),gy=Math.floor(p.y/cell);let collision=false;
            for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++)if(occupied.has(`${gx+a},${gy+b}`))collision=true;
            if(collision)continue;occupied.add(`${gx},${gy}`);
            this.arrow(ctx,p.x,p.y,e.dx,-e.dy,state.settings.arrowSize);
          }
        }
        ctx.stroke();
      }
    }
    grid(ctx,view) {
      const w=this.width,h=this.height,step=niceStep(view.scale),spacing=step*view.scale;
      const tl=P.screenToWorld(0,0,view,w,h), br=P.screenToWorld(w,h,view,w,h);
      ctx.lineWidth=1;ctx.strokeStyle='#1c2935';ctx.beginPath();
      for(let x=Math.ceil(tl.x/step)*step;x<=br.x;x+=step){const sx=this.project(x,0,view).x;ctx.moveTo(Math.round(sx)+.5,0);ctx.lineTo(Math.round(sx)+.5,h);}
      for(let y=Math.ceil(br.y/step)*step;y<=tl.y;y+=step){const sy=this.project(0,y,view).y;ctx.moveTo(0,Math.round(sy)+.5);ctx.lineTo(w,Math.round(sy)+.5);}
      ctx.stroke();
      // Minor intersections give scale without adding a second dense grid.
      if(spacing>65){ctx.fillStyle='#22303d';for(let sx=((w/2-view.x*view.scale)%(spacing/5)+spacing/5)%(spacing/5);sx<w;sx+=spacing/5)for(let sy=((h/2+view.y*view.scale)%(spacing/5)+spacing/5)%(spacing/5);sy<h;sy+=spacing/5)ctx.fillRect(sx,sy,1,1);}
      const origin=this.project(0,0,view);ctx.strokeStyle='#354452';ctx.beginPath();ctx.moveTo(0,origin.y+.5);ctx.lineTo(w,origin.y+.5);ctx.moveTo(origin.x+.5,0);ctx.lineTo(origin.x+.5,h);ctx.stroke();
      ctx.font='9px Consolas,monospace';ctx.fillStyle='#5b7185';ctx.textAlign='center';
      const ly=Math.max(16,Math.min(h-55,origin.y+17));
      for(let x=Math.ceil(tl.x/step)*step;x<=br.x;x+=step){const sx=this.project(x,0,view).x;if(sx>20&&sx<w-20)ctx.fillText(tickLabel(x,step),sx,ly);}
      ctx.textAlign='right';const lx=Math.max(36,Math.min(w-20,origin.x-9));
      for(let y=Math.ceil(br.y/step)*step;y<=tl.y;y+=step){if(Math.abs(y)<step*.01)continue;const sy=this.project(0,y,view).y;if(sy>16&&sy<h-50)ctx.fillText(tickLabel(y,step),lx,sy+3);}
      ctx.fillStyle='#8096a9';ctx.textAlign='right';ctx.fillText('x / m',w-15,Math.max(18,Math.min(h-55,origin.y-10)));ctx.textAlign='left';ctx.fillText('y / m',Math.max(13,Math.min(w-50,origin.x+10)),18);
    }
    arrow(ctx,x,y,dx,dy,size){ctx.moveTo(x-dx*size-dy*size*.53,y-dy*size+dx*size*.53);ctx.lineTo(x,y);ctx.lineTo(x-dx*size+dy*size*.53,y-dy*size-dx*size*.53);}
    draw(state,pointer) {
      const ctx=this.ctx;ctx.clearRect(0,0,this.width,this.height);ctx.drawImage(this.back,0,0,this.width,this.height);
      for(const c of state.charges) {
        const p=this.project(c.x,c.y,state.view);if(p.x<-50||p.x>this.width+50||p.y<-50||p.y>this.height+50)continue;
        const color=c.q>0?'#fa7b80':c.q<0?'#77adff':'#abb7c3';
        if(c.id===state.selected){ctx.beginPath();ctx.arc(p.x,p.y,23,0,Math.PI*2);ctx.fillStyle=color+'0e';ctx.fill();ctx.strokeStyle=color+'80';ctx.lineWidth=1;ctx.setLineDash([3,4]);ctx.stroke();ctx.setLineDash([]);}
        const glow=ctx.createRadialGradient(p.x,p.y,8,p.x,p.y,29);glow.addColorStop(0,color+'30');glow.addColorStop(1,color+'00');ctx.fillStyle=glow;ctx.fillRect(p.x-29,p.y-29,58,58);
        ctx.beginPath();ctx.arc(p.x,p.y,14,0,Math.PI*2);ctx.fillStyle=c.q>0?'#5a303a':c.q<0?'#263e60':'#35404e';ctx.fill();ctx.strokeStyle=color;ctx.lineWidth=1.6;ctx.stroke();
        ctx.fillStyle=color;ctx.font='21px "Segoe UI",sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(c.q>0?'+':c.q<0?'−':'0',p.x,p.y-1);
        ctx.font='11px "Segoe UI","Malgun Gothic",sans-serif';ctx.textBaseline='alphabetic';ctx.fillStyle='#b6c6d4';
        let label=c.name||`Q${c.id}`;
        if(ctx.measureText(label).width>140){const chars=Array.from(label);while(chars.length&&ctx.measureText(chars.join('')+'…').width>140)chars.pop();label=chars.join('')+'…';}
        ctx.fillText(label,p.x,p.y+34);
      }
      if(pointer&&pointer.inside) {
        const e=P.fieldAt(pointer.world.x,pointer.world.y,state.charges);
        if(Number.isFinite(e.magnitude)&&e.magnitude>0&&!state.charges.some(c=>Math.hypot(c.x-pointer.world.x,c.y-pointer.world.y)*state.view.scale<28)) {
          ctx.strokeStyle='#dce9e3';ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(pointer.x,pointer.y);const tx=pointer.x+e.dx*24,ty=pointer.y-e.dy*24;ctx.lineTo(tx,ty);this.arrow(ctx,tx,ty,e.dx,-e.dy,5);ctx.stroke();ctx.fillStyle='#e0eee5';ctx.beginPath();ctx.arc(pointer.x,pointer.y,2,0,Math.PI*2);ctx.fill();
        }
      }
    }
    exportPNG(state) {
      const canvas=document.createElement('canvas');canvas.width=this.canvas.width;canvas.height=this.canvas.height;
      const ctx=canvas.getContext('2d');this.draw(state,null);ctx.drawImage(this.canvas,0,0);ctx.scale(this.dpr,this.dpr);
      ctx.fillStyle='#111c2be8';ctx.fillRect(18,18,300,58);ctx.fillStyle='#b6e9d0';ctx.font='bold 12px "Segoe UI",sans-serif';ctx.fillText('FIELDWORK / ELECTRIC FIELD LAB',30,41);ctx.font='10px Consolas,monospace';ctx.fillStyle='#a6b9c6';ctx.fillText(`${state.charges.length} charges · SI units · Coulomb + RK4`,30,60);return canvas;
    }
  }
  root.EFRenderer={Renderer,niceStep};
})(globalThis);
