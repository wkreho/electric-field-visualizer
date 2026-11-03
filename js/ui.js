(function(root){
  'use strict';
  const $=id=>document.getElementById(id), P=root.EFPhysics;
  function quantity(q) {
    if(q===0)return '0 C';const a=Math.abs(q),sign=q>0?'+':'−';
    const units=[[1,'C'],[1e-3,'mC'],[1e-6,'μC'],[1e-9,'nC'],[1e-12,'pC']];
    const unit=units.find(([scale])=>a>=scale);return unit?`${sign}${Number((a/unit[0]).toPrecision(3))} ${unit[1]}`:`${q.toExponential(2)} C`;
  }
  function sci(n){if(!Number.isFinite(n))return '정의되지 않음';if(n===0)return '0';return Math.abs(n)>=.01&&Math.abs(n)<1e4?Number(n.toPrecision(4)).toString():n.toExponential(3);}
  function coord(n){return Math.abs(n)>=1e4||(n!==0&&Math.abs(n)<.001)?n.toExponential(2):n.toFixed(3);}
  let toastTimer;
  function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3400);}
  root.EFUI={$,quantity,sci,coord,toast};
})(globalThis);
