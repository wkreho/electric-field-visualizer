(function(root) {
  'use strict';
  const P=root.EFPhysics;
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

  }
  root.EFRenderer={Renderer,niceStep};
})(globalThis);
