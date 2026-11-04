import {test,expect} from '@playwright/test';
test.use({hasTouch:true,launchOptions:{executablePath:'/usr/bin/google-chrome'}});

async function setup(page){
 await page.goto('/');await page.locator('[data-tool=pen]').click();
 await page.locator('#snapping').evaluate(el=>el.checked=false);
 const r=await page.locator('#canvas').boundingBox();
 return [[120,140],[280,140],[280,300]].map(([x,y])=>({x:r.x+x,y:r.y+y}));
}
async function tap(page,p){await page.touchscreen.tap(p.x,p.y);}
async function live(page){return page.evaluate(async()=>{
 const {default:paper}=await import(performance.getEntriesByType('resource').find(e=>e.name.includes('/deps/paper.js')).name);
 return paper.project.layers[1].children.map(p=>({closed:p.closed,segments:p.segments.map(s=>[s.point,s.handleIn,s.handleOut].map(v=>[v.x,v.y].map(n=>Number(n.toFixed(8)))))}));
});}
async function save(page){
 await page.locator('#save').click();const waiting=page.waitForEvent('download');await page.locator('#download-svg').click();
 return Buffer.concat(await(await(await waiting).createReadStream()).toArray()).toString();
}
for(const count of [2,3])for(const endpoint of ['first','last'])test(`touching the ${endpoint} of ${count} pen nodes finishes without adding a node and survives SVG reopening`,async({page})=>{
 const points=(await setup(page)).slice(0,count);for(const p of points)await tap(page,p);
 const before=await live(page);await expect(page.locator('#finish')).toBeVisible();
 await tap(page,endpoint==='first'?points[0]:points.at(-1));
 await expect(page.locator('#finish')).toBeHidden();
 const finished=await live(page);expect(finished).toEqual([{...before[0],closed:endpoint==='first'}]);
 const svg=await save(page);expect(svg).not.toContain('pen-preview');
 page.once('dialog',d=>d.accept());await page.locator('#file').setInputFiles({name:'touch.svg',mimeType:'image/svg+xml',buffer:Buffer.from(svg)});
 await expect(page.locator('#status')).toContainText('SVG opened');
 const reopened=await live(page);expect(reopened[0].closed).toBe(endpoint==='first');expect(reopened[0].segments).toHaveLength(count);
});

test('finishing an open curved path preserves its handles and starts a separate path with touch undo and redo',async({page})=>{
 const [a,b,c]=await setup(page);await tap(page,a);
 const cdp=await page.context().newCDPSession(page);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x,y:b.y}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:b.x+35,y:b.y+40}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 const curve=await live(page);expect(Math.hypot(...curve[0].segments[1][2])).toBeGreaterThan(20);
 await tap(page,b);await expect(page.locator('#finish')).toBeHidden();expect(await live(page)).toEqual(curve);
 await tap(page,c);await tap(page,{x:c.x+120,y:c.y});await tap(page,{x:c.x+120,y:c.y});
 const both=await live(page);expect(both).toHaveLength(2);expect(both[1].segments).toHaveLength(2);
 await page.locator('#canvas-undo').click();expect(await live(page)).toEqual(curve);
 await page.locator('#canvas-redo').click();expect(await live(page)).toEqual(both);
 await page.reload();expect(await live(page)).toEqual(both);
});

for(const endpoint of ['first','last'])test(`pinching or cancelling a touch on the ${endpoint} node keeps the pen path active`,async({page})=>{
 const points=await setup(page);for(const p of points)await tap(page,p);
 const before=await live(page),p=endpoint==='first'?points[0]:points.at(-1),cdp=await page.context().newCDPSession(page);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:p.x,y:p.y}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
 expect(await live(page)).toEqual(before);await expect(page.locator('#finish')).toBeVisible();
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:p.x,y:p.y}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:p.x,y:p.y},{id:2,x:p.x+80,y:p.y+20}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:p.x-15,y:p.y},{id:2,x:p.x+95,y:p.y+20}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 expect(await live(page)).toEqual(before);await expect(page.locator('#finish')).toBeVisible();
});

test('the nearer endpoint wins when the first and last touch targets overlap',async({page})=>{
 const [a,b]=await setup(page),c={x:a.x+20,y:a.y};
 for(const p of [a,b,c])await tap(page,p);
 await tap(page,{x:c.x-6,y:c.y});await expect(page.locator('#finish')).toBeHidden();
 expect((await live(page))[0].closed).toBe(false);expect((await live(page))[0].segments).toHaveLength(3);
});
