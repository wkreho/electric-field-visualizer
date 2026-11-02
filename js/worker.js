'use strict';
importScripts('physics.js','fieldLines.js');
self.onmessage=({data})=>{
  try {self.postMessage({id:data.id,result:self.EFLines.generate(data.scene)});}
  catch(error) {self.postMessage({id:data.id,error:error.message});}
};
