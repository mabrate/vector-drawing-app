import {test,expect} from '@playwright/test';
import paper from 'paper';
import {simplifyPath} from '../src/simplify-path.js';
test.use({launchOptions:{executablePath:'/usr/bin/google-chrome'}});
function mixedPath(closed=false,explicit=true){
 const steps=20,radius=100,k=4/3*Math.tan(Math.PI/steps/4)*radius,segments=[new paper.Segment([100,300],[0,0],[30,0])];
 for(let i=0;i<=steps;i++){const theta=Math.PI-i*Math.PI/steps,p=new paper.Point(300+radius*Math.cos(theta),300-radius*Math.sin(theta)),tangent=new paper.Point(Math.sin(theta),Math.cos(theta));segments.push(new paper.Segment(p,i===0?[-30,0]:tangent.multiply(-k),i===steps?[30,0]:tangent.multiply(k)));}
 segments.push(new paper.Segment([500,300],[-30,0],[0,0]));if(closed)segments.push(new paper.Segment([500,450]),new paper.Segment([100,450]));
 const path=new paper.Path({segments,closed,insert:false,strokeColor:'black',strokeWidth:5,fillColor:null});
 if(explicit)path.data.nodeModes=Object.fromEntries(path.segments.map((s,i)=>[i,i>1&&i<steps+1?'round':'corner']));
 return path;
}
function at(path,x,y){return path.segments.find(s=>s.point.getDistance(new paper.Point(x,y))<1e-7);}
for(const closed of [false,true])for(const explicit of [false,true])test(`simplifying mixed corners and curves keeps sharp joins (closed=${closed}, explicit=${explicit})`,()=>{
 paper.setup(new paper.Size(1056,816));const path=mixedPath(closed,explicit),before=path.exportJSON({asString:true}),copy=simplifyPath(path,2);
 expect(copy.segments.length).toBeLessThan(path.segments.length);expect(copy.closed).toBe(closed);expect(path.exportJSON({asString:true})).toBe(before);
 for(const xy of [[200,300],[400,300]]){const s=at(copy,...xy);expect(s).toBeTruthy();expect(copy.data.nodeModes[s.index]).toBe('corner');expect(s.isSmooth()).toBe(false);const incoming=s.previous.curve.getTangentAtTime(1),outgoing=s.curve.getTangentAtTime(0);expect(Math.abs(incoming.dot(outgoing))).toBeLessThan(1e-6);}
 const round=copy.segments.filter(s=>copy.data.nodeModes[s.index]==='round');expect(round.length).toBeGreaterThan(0);expect(round.every(s=>s.isSmooth())).toBe(true);expect(copy.strokeWidth).toBe(5);
 if(closed)for(const xy of [[100,300],[500,300],[500,450],[100,450]])expect(at(copy,...xy)).toBeTruthy();
});
test('explicit independent nodes are retained even when their handles happen to line up',()=>{
 paper.setup(new paper.Size(1056,816));const path=mixedPath(false,true),marked=path.segments[7];path.data.nodeModes[7]='corner';const copy=simplifyPath(path,5),retained=at(copy,marked.point.x,marked.point.y);expect(retained).toBeTruthy();expect(copy.data.nodeModes[retained.index]).toBe('corner');expect(copy.segments.length).toBeLessThan(path.segments.length);
});
test('redundant straight-line nodes can still simplify and zero tolerance leaves modes intact',()=>{
 paper.setup(new paper.Size(1056,816));const path=new paper.Path({segments:Array.from({length:11},(_,i)=>[100+i*20,300]),insert:false});const copy=simplifyPath(path,1);expect(copy.segments).toHaveLength(2);path.data.nodeModes={5:'corner'};const protectedCopy=simplifyPath(path,5);expect(protectedCopy.segments).toHaveLength(3);expect(at(protectedCopy,200,300)).toBeTruthy();expect(simplifyPath(path,0).exportJSON({asString:true})).toBe(path.exportJSON({asString:true}));
});
test('a smooth closed path and a path with one sharp closing join remain closed',()=>{
 paper.setup(new paper.Size(1056,816));const path=new paper.Path.Circle({center:[300,300],radius:100,insert:false});for(let i=0;i<3;i++)for(const curve of [...path.curves])curve.divideAtTime(.5);const n=path.segments.length;
 for(const corner of [false,true]){path.data.nodeModes=corner?{0:'corner'}:{};const copy=simplifyPath(path,2);expect(copy.closed).toBe(true);expect(copy.segments.length).toBeLessThan(n);if(corner){const retained=at(copy,path.firstSegment.point.x,path.firstSegment.point.y);expect(retained).toBeTruthy();expect(copy.data.nodeModes[retained.index]).toBe('corner');}}
});
test('sharp polygons stay sharp and transformed paths retain their placement',()=>{
 paper.setup(new paper.Size(1056,816));const rectangle=new paper.Path.Rectangle({point:[100,100],size:[200,100],insert:false}),polygon=simplifyPath(rectangle,10);expect(polygon.pathData).toBe(rectangle.pathData);expect(polygon.segments.every(s=>!s.isSmooth())).toBe(true);
 const path=mixedPath(true,true);path.applyMatrix=false;path.scale(1.7,.8);path.rotate(24);path.translate([60,35]);const copy=simplifyPath(path,2);expect(copy.matrix.values).toEqual(path.matrix.values);expect(copy.segments.length).toBeLessThan(path.segments.length);for(const xy of [[200,300],[400,300]]){const s=at(copy,...xy),original=at(path,...xy);expect(copy.localToGlobal(s.point).getDistance(path.localToGlobal(original.point))).toBeLessThan(1e-8);expect(copy.data.nodeModes[s.index]).toBe('corner');}
});

test('Simplify preview and apply preserve sharp nodes through undo, recovery and SVG reopening',async({page},testInfo)=>{
 paper.setup(new paper.Size(1056,816));const fixture=mixedPath(true,true),pathData=fixture.pathData,data=JSON.stringify(fixture.data).replaceAll('&','&amp;').replaceAll('"','&quot;');
 await page.goto('/');page.once('dialog',d=>d.accept());await page.locator('#file').setInputFiles({name:'mixed.svg',mimeType:'image/svg+xml',buffer:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${pathData}" data-paper-data="${data}" fill="none" stroke="black" stroke-width="5"/></svg>`)});await expect(page.locator('#status')).toContainText('SVG opened');await page.keyboard.press('Control+a');await page.keyboard.press('n');
 const saved=()=>page.evaluate(()=>localStorage.getItem('vector-lab')),before=await saved(page);
 await page.locator('#simplify-path').click();await page.locator('#simplify-tolerance').fill('2');await expect(page.locator('#simplify-apply')).toBeEnabled();expect(await saved()).toBe(before);await page.screenshot({path:testInfo.outputPath('sharp-corner-preview.png')});await page.locator('#simplify-cancel').click();expect(await saved()).toBe(before);
 await page.locator('#simplify-path').click();await page.locator('#simplify-tolerance').fill('2');await page.locator('#simplify-apply').click();const after=await saved();expect(after).not.toBe(before);
 async function check(){return page.evaluate(async()=>{const {default:paper}=await import(performance.getEntriesByType('resource').find(e=>e.name.includes('/deps/paper.js')).name),path=paper.project.layers[1].children[0];return [[200,300],[400,300]].map(xy=>{const node=path.segments.find(s=>s.point.getDistance(new paper.Point(xy))<1e-5);return node?{mode:path.data.nodeModes[node.index],smooth:node.isSmooth()}:null;});});}
 const stable=json=>JSON.parse(JSON.stringify(JSON.parse(json),(_,value)=>typeof value==='number'?Math.round(value*1e9)/1e9:value));
 expect(await check()).toEqual([{mode:'corner',smooth:false},{mode:'corner',smooth:false}]);await page.locator('#canvas-undo').click();expect(stable(await saved())).toEqual(stable(before));await page.locator('#canvas-redo').click();expect(stable(await saved())).toEqual(stable(after));await page.reload();expect(await check()).toEqual([{mode:'corner',smooth:false},{mode:'corner',smooth:false}]);
 await page.locator('#save').click();await expect(page.locator('#download-svg')).toBeEnabled();const waiting=page.waitForEvent('download');await page.locator('#download-svg').click();const svg=Buffer.concat(await(await(await waiting).createReadStream()).toArray());page.once('dialog',d=>d.accept());await page.locator('#file').setInputFiles({name:'simplified.svg',mimeType:'image/svg+xml',buffer:svg});await expect(page.locator('#status')).toContainText('SVG opened');expect(await check()).toEqual([{mode:'corner',smooth:false},{mode:'corner',smooth:false}]);
});
function denseOutline(){return new paper.Path({segments:Array.from({length:93},(_,i)=>{const t=i/93*2*Math.PI;return[400+200*Math.cos(t),350+120*Math.sin(t)];}),closed:true,insert:false});}
test('a dense 93-node outline simplifies across the slider range without reverting at high tolerance',()=>{
 paper.setup(new paper.Size(1056,816));const path=denseOutline(),counts=[0,.1,.5,1,2,5,10].map(t=>simplifyPath(path,t).segments.length);expect(counts[0]).toBe(93);for(let i=1;i<counts.length;i++){expect(counts[i]).toBeLessThanOrEqual(counts[i-1]);expect(counts[i]).toBeGreaterThanOrEqual(3);}expect(counts.at(-1)).toBeLessThan(10);
 for(const tolerance of [1,5,10]){const copy=simplifyPath(path,tolerance);expect(Math.abs(copy.bounds.width-path.bounds.width)).toBeLessThan(2*tolerance);expect(Math.abs(copy.bounds.height-path.bounds.height)).toBeLessThan(2*tolerance);for(const curve of path.curves)for(const t of [.25,.5,.75]){const p=curve.getPointAtTime(t);expect(copy.getNearestPoint(p).getDistance(p)).toBeLessThan(2*tolerance);}}
 const box=new paper.Path({segments:[[0,0],[100,0],[200,0],[200,100],[200,200],[100,200],[0,200],[0,100]],closed:true,insert:false}),copy=simplifyPath(box,10);for(const xy of [[0,0],[200,0],[200,200],[0,200]]){const corner=at(copy,...xy);expect(corner).toBeTruthy();expect(copy.data.nodeModes[corner.index]).toBe('corner');}
});
test('the dialog shows live tolerance separately from original and preview node counts',async({page},testInfo)=>{
 paper.setup(new paper.Size(1056,816));const pathData=denseOutline().pathData;await page.goto('/');page.once('dialog',d=>d.accept());await page.locator('#file').setInputFiles({name:'93-nodes.svg',mimeType:'image/svg+xml',buffer:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${pathData}" fill="none" stroke="black"/></svg>`)});await expect(page.locator('#status')).toContainText('SVG opened');await page.keyboard.press('Control+a');await page.keyboard.press('n');await page.locator('#simplify-path').click();
 await page.locator('#simplify-tolerance').fill('0');await expect(page.locator('#simplify-tolerance-value')).toHaveText('0 px');await expect(page.locator('#simplify-count')).toHaveText('Nodes: 93 → 93');await expect(page.locator('#simplify-result-help')).toHaveText('0 px keeps the original outline.');
 await page.locator('#simplify-tolerance').fill('2.5');await expect(page.locator('#simplify-tolerance-value')).toHaveText('2.5 px');await expect(page.locator('#simplify-count')).not.toHaveText('Nodes: 93 → 93');await expect(page.locator('#simplify-apply')).toBeEnabled();
 await page.locator('#simplify-tolerance').fill('10');await expect(page.locator('#simplify-tolerance-value')).toHaveText('10 px');await expect(page.locator('#simplify-count')).not.toHaveText('Nodes: 93 → 93');await page.screenshot({path:testInfo.outputPath('tolerance-and-node-counts.png')});
});
test('the dialog explains when protected corners prevent a node reduction',async({page})=>{
 await page.goto('/');page.once('dialog',d=>d.accept());await page.locator('#file').setInputFiles({name:'corners.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><path d="M300 300h200v100H300z" fill="none" stroke="black"/></svg>')});await expect(page.locator('#status')).toContainText('SVG opened');await page.keyboard.press('Control+a');await page.keyboard.press('n');await page.locator('#simplify-path').click();await page.locator('#simplify-tolerance').fill('10');await expect(page.locator('#simplify-tolerance-value')).toHaveText('10 px');await expect(page.locator('#simplify-count')).toHaveText('Nodes: 4 → 4');await expect(page.locator('#simplify-result-help')).toContainText('preserving sharp corners');await expect(page.locator('#simplify-apply')).toBeDisabled();
});
