'use strict';
importScripts('physics.js','fieldLines.js','simulation-physics.js','simulation-fields.js');
self.onmessage=({data})=>{try{self.postMessage({epoch:data.epoch,time:data.time,result:EFSimulationFields.generate(data.scene)});}catch(error){self.postMessage({epoch:data.epoch,error:error.message});}};
