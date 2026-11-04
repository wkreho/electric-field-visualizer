(function(root){
  'use strict';
  const P=root.EFPhysics,L=root.EFLines,S=root.EFSimulation;
  class SimulationRenderer extends root.EFRenderer.Renderer{
    background(state){
      const ctx=this.bg,settings=state.engine.settings,view=state.view;ctx.fillStyle='#0e151e';ctx.fillRect(0,0,this.width,this.height);
      if(settings.showGrid)this.grid(ctx,view);
      if(!settings.showFieldLines)return;
      ctx.strokeStyle='rgba(157,215,194,.48)';ctx.lineWidth=settings.lineWidth;ctx.lineJoin='round';ctx.beginPath();
      for(const line of this.data.lines){for(let i=0;i<line.points.length;i+=2){const p=this.project(line.points[i],line.points[i+1],view);if(!i)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);}}ctx.stroke();
      if(!settings.showArrows)return;
      ctx.strokeStyle='#aedbc6';ctx.lineWidth=1;ctx.beginPath();const occupied=new Set();
      for(const line of this.data.lines){let phase=.3;
        for(let i=2;i<line.points.length;i+=2){const index=i/2*3,mag=line.fields[index],dx=line.fields[index+1],dy=line.fields[index+2];
          const ds=Math.hypot(line.points[i]-line.points[i-2],line.points[i+1]-line.points[i-1])*view.scale;
          phase+=ds/L.arrowSpacing(mag,this.data.logMin,this.data.logMax,settings.arrowDensity);if(phase<1)continue;phase%=1;
          const p=this.project(line.points[i],line.points[i+1],view),gx=Math.floor(p.x/12),gy=Math.floor(p.y/12);if(p.x<8||p.y<8||p.x>this.width-8||p.y>this.height-8||(!dx&&!dy))continue;
          let collision=false;for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++)if(occupied.has(`${gx+a},${gy+b}`))collision=true;if(collision)continue;occupied.add(`${gx},${gy}`);this.arrow(ctx,p.x,p.y,dx,-dy,settings.arrowSize);
        }
      }ctx.stroke();
    }
    vector(ctx,p,x,y,color,force=false){const norm=Math.hypot(x,y);if(!norm||!Number.isFinite(norm))return;const length=force?Math.min(82,18*Math.log10(1+norm/1e-11)):Math.min(82,norm*22);if(length<2)return;const dx=x/norm,dy=-y/norm,tx=p.x+dx*length,ty=p.y+dy*length;ctx.strokeStyle=color;ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(tx,ty);this.arrow(ctx,tx,ty,dx,dy,6);ctx.stroke();}
    drawScene(state,pointer){
      const ctx=this.ctx,{engine,view}=state,settings=engine.settings;ctx.clearRect(0,0,this.width,this.height);ctx.drawImage(this.back,0,0,this.width,this.height);
      if(settings.showTrails){ctx.strokeStyle='#e2b66fd9';ctx.lineWidth=1.8;ctx.setLineDash([4,3]);for(const trail of engine.trails.values()){ctx.beginPath();for(let i=0;i<trail.length;i+=2){const p=this.project(trail[i],trail[i+1],view);if(!i)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);}ctx.stroke();}ctx.setLineDash([]);}
      for(let index=0;index<engine.bodies.length;index++){
        const b=engine.bodies[index],p=this.project(b.x,b.y,view),radius=b.type==='point'?13:b.radius*view.scale,color=b.q>0?'#fa7b80':b.q<0?'#77adff':'#a6b4c4';
        if(p.x+radius<-40||p.y+radius<-40||p.x-radius>this.width+40||p.y-radius>this.height+40)continue;
        ctx.beginPath();ctx.arc(p.x,p.y,Math.min(radius,1e7),0,Math.PI*2);ctx.strokeStyle=color;ctx.lineWidth=b.type==='ring'?3:1.7;
        if(b.type!=='ring'){ctx.fillStyle=b.type==='disk'?color+'1c':b.q>0?'#5a303a':b.q<0?'#263e60':'#35404e';ctx.fill();}ctx.stroke();
        if(state.selection?state.selection.includes(b.id):b.id===state.selected){ctx.beginPath();ctx.arc(p.x,p.y,Math.min(radius+7,1e7),0,Math.PI*2);ctx.strokeStyle=color+'c0';ctx.lineWidth=1;ctx.setLineDash([3,4]);ctx.stroke();ctx.setLineDash([]);
          if(b.type!=='point'&&radius>25){ctx.fillStyle=color+'70';for(const n of S.offsets(b,settings.quality)){const s=this.project(b.x+n.x,b.y+n.y,view);ctx.fillRect(s.x-1,s.y-1,2,2);}}
        }
        if(b.type!=='point'){ctx.fillStyle='#15202fe8';ctx.beginPath();ctx.arc(p.x,p.y,11,0,Math.PI*2);ctx.fill();}
        ctx.fillStyle=color;ctx.font='19px "Segoe UI",sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(b.q>0?'+':b.q<0?'−':'0',p.x,p.y-1);
        ctx.font='10px "Segoe UI","Malgun Gothic",sans-serif';ctx.textBaseline='alphabetic';ctx.fillStyle='#c4d3dc';const label=Array.from(b.name).length>20?Array.from(b.name).slice(0,18).join('')+'…':b.name;ctx.fillText(label,p.x,p.y+(b.type==='point'?31:Math.min(radius+18,90)));
        if(b.fixed){ctx.fillStyle='#879bad';ctx.fillRect(p.x-3,p.y-23,6,5);}else{
          if(settings.showVelocity)this.vector(ctx,p,b.vx,b.vy,'#6dd5ef');
          if(settings.showForces)this.vector(ctx,p,engine.forces[index]?.x||0,engine.forces[index]?.y||0,'#dba0f5',true);
        }
      }
      if(state.probe){const p=this.project(state.probe.x,state.probe.y,view);ctx.strokeStyle='#d5efe2';ctx.lineWidth=1.3;ctx.beginPath();ctx.arc(p.x,p.y,4,0,Math.PI*2);ctx.moveTo(p.x-9,p.y);ctx.lineTo(p.x+9,p.y);ctx.moveTo(p.x,p.y-9);ctx.lineTo(p.x,p.y+9);ctx.stroke();}
    }
  }
  root.EFSimulationRenderer=SimulationRenderer;
})(globalThis);
