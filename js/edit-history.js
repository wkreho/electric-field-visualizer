/* User edits only: physics frames never enter these bounded stacks. */
(function(root){
  'use strict';
  const S=root.EFSimulation||(typeof require!=='undefined'&&require('./simulation-physics.js'));
  const copy=value=>JSON.parse(JSON.stringify(value));
  const content=s=>JSON.stringify({bodies:s.bodies,initialBodies:s.initialBodies,time:s.time,physics:s.physics});
  function capture(engine,meta={}){return {bodies:S.clone(engine.bodies),initialBodies:S.clone(engine.initial),time:engine.time,physics:Object.fromEntries(['dt','quality','fieldQuality','collisionRadius','preserveXAxisSymmetry'].map(k=>[k,engine.settings[k]])),selected:meta.selected??null,selection:[...(meta.selection??(meta.selected==null?[]:[meta.selected]))],preset:meta.preset||''};}
  function restore(engine,snapshot,view){
    const data=S.validateScene({application:'FIELDWORK_SIMULATION',version:1,...copy(snapshot),settings:{...engine.settings,...snapshot.physics},view});
    if(S.samples(data.bodies,data.settings.fieldQuality).length>512)throw new Error('Field sample budget exceeded.');
    engine.restore(data);if(engine.bodies.length)engine.status='paused';
    const selection=(snapshot.selection??(snapshot.selected==null?[]:[snapshot.selected])).filter(id=>engine.bodies.some(b=>b.id===id));
    return {selection,selected:engine.bodies.some(b=>b.id===snapshot.selected)?snapshot.selected:null,preset:snapshot.preset};
  }
  class History{
    constructor(limit=150,onChange=()=>{}){this.limit=Math.max(1,Math.min(200,Math.floor(limit)||150));this.undoStack=[];this.redoStack=[];this.onChange=onChange;this.pending=null;}
    record(label,before,after){if(content(before)===content(after))return false;this.undoStack.push({label,before:copy(before),after:copy(after)});if(this.undoStack.length>this.limit)this.undoStack.shift();this.redoStack=[];this.onChange();return true;}
    begin(label,before){if(this.pending)throw new Error('An edit is already active.');this.pending={label,before:copy(before)};}
    finish(after){const edit=this.pending;this.pending=null;return edit?this.record(edit.label,edit.before,after):false;}
    cancel(){this.pending=null;}
    undo(apply){return this.transfer(this.undoStack,this.redoStack,'before',apply);}
    redo(apply){return this.transfer(this.redoStack,this.undoStack,'after',apply);}
    transfer(from,to,key,apply){if(!from.length)return false;const edit=from[from.length-1];apply(copy(edit[key]));from.pop();to.push(edit);this.onChange();return true;}
  }
  function shortcut(event){
    const target=event.target;
    if(event.altKey||!(event.ctrlKey||event.metaKey)||target?.isContentEditable||target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])'))return null;
    const key=event.key.toLowerCase();return key==='z'?(event.shiftKey?'redo':'undo'):key==='y'?'redo':null;
  }
  const api={History,capture,restore,shortcut};root.EFEditHistory=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
