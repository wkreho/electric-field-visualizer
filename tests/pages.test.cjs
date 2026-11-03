const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..');
test('single main page, compatibility URL and every asset load under the GitHub Pages repository prefix',async()=>{
  const prefix='/electric-field-visualizer',child=spawn(process.execPath,['serve.cjs','0',prefix],{cwd:root,stdio:['ignore','pipe','pipe']});
  try{
    const url=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Preview startup timeout')),5000);child.once('error',reject);child.stdout.on('data',chunk=>{const match=String(chunk).match(/http:\/\/127\.0\.0\.1:\d+\S*/);if(match){clearTimeout(timer);resolve(match[0]);}});});
    const response=await fetch(url);assert.equal(response.status,200);const html=await response.text();assert.match(html,/id="field-canvas"/);assert.doesNotMatch(html,/page-nav|http-equiv="refresh"/);
    const assets=[...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map(m=>m[1]);
    assets.push('js/simulation-worker.js');
    for(const asset of assets){assert.ok(!asset.startsWith('/'));const r=await fetch(new URL(asset,url));assert.equal(r.status,200,asset);assert.ok((await r.text()).length>0);}
    const worker=fs.readFileSync(path.join(root,'js/simulation-worker.js'),'utf8');for(const m of worker.matchAll(/'([^']+\.js)'/g)){const r=await fetch(new URL('js/'+m[1],url));assert.equal(r.status,200,m[1]);}
    const compat=await fetch(new URL('simulation.html',url));assert.equal(compat.status,200);assert.match(await compat.text(),/location.replace\('index.html'\+location.search\+location.hash\)/);
    for(const obsolete of ['js/main.js','js/worker.js','css/navigation.css'])assert.equal((await fetch(new URL(obsolete,url))).status,404);
  }finally{child.kill();}
});
test('README local images and links point to existing files; browser scripts parse',()=>{
  const readme=fs.readFileSync(path.join(root,'README.md'),'utf8');for(const match of readme.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)){const target=match[1];if(!/^(https?:|#)/.test(target))assert.ok(fs.existsSync(path.join(root,target)),target);}
  const vm=require('node:vm');for(const file of fs.readdirSync(path.join(root,'js')).filter(f=>f.endsWith('.js')))new vm.Script(fs.readFileSync(path.join(root,'js',file),'utf8'),{filename:file});
});
