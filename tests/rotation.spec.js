import {test,expect} from '@playwright/test';
test.use({hasTouch:true});
async function setup(page){
 await page.goto('/');page.once('dialog',d=>d.accept());await page.locator('#file').setInputFiles({name:'rotation.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><path fill="orange" d="M428 358h200v100h-200z"/></svg>')});await expect(page.locator('#status')).toContainText('SVG opened');await page.keyboard.press('Control+a');
 const r=await page.locator('#canvas').boundingBox(),z=Math.min((r.width-50)/1056,(r.height-50)/816),cx=r.x+r.width/2,cy=r.y+r.height/2,radius=50*z+32;
 return (angle,extra=0)=>({x:cx+(radius+extra)*Math.sin(angle*Math.PI/180),y:cy-(radius+extra)*Math.cos(angle*Math.PI/180)});
}
async function angle(page){return page.evaluate(()=>{const item=JSON.parse(localStorage.getItem('vector-lab'))[1].children[0][1],m=new DOMMatrix(item.matrix||[1,0,0,1,0,0]);const points=item.segments.slice(0,2).map(s=>{const p=Array.isArray(s[0])?s[0]:s;return new DOMPoint(...p).matrixTransform(m);});return Math.atan2(points[1].y-points[0].y,points[1].x-points[0].x)*180/Math.PI;});}
test('Ctrl snaps handle rotation to 15 degrees and updates when pressed or released during a drag',async({page})=>{
 const at=await setup(page),start=at(0),end=at(22);await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:8});await expect(page.locator('#rotation-readout')).toContainText('22° · free');
 await page.keyboard.down('Control');await expect(page.locator('#rotation-readout')).toContainText('15° · 15° snap');await page.keyboard.up('Control');await expect(page.locator('#rotation-readout')).toContainText('22° · free');await page.keyboard.down('Control');await page.mouse.up();await page.keyboard.up('Control');expect(await angle(page)).toBeCloseTo(15,3);await expect(page.locator('#rotation-readout')).toBeHidden();
 await page.keyboard.press('Control+z');expect(await angle(page)).toBeCloseTo(0,3);await page.keyboard.press('Control+Shift+z');expect(await angle(page)).toBeCloseTo(15,3);
});
for(const viewport of [{width:820,height:1180},{width:390,height:844}])test(`touch rotation changes from 15-degree steps to 1-degree precision at ${viewport.width}px`,async({page})=>{
 await page.setViewportSize(viewport);const at=await setup(page),cdp=await page.context().newCDPSession(page);
 async function touch(type,angle,extra=0){const p=at(angle,extra);await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:[{id:1,x:p.x,y:p.y}]});}
 await touch('touchStart',0);await touch('touchMove',22);await expect(page.locator('#rotation-readout')).toContainText('15° · 15° snap');await expect(page.locator('#rotation-readout')).toContainText('Move farther out');
 await touch('touchMove',23,100);await expect(page.locator('#rotation-readout')).toContainText('23° · 1° precision');await touch('touchMove',23,70);await expect(page.locator('#rotation-readout')).toContainText('1° precision');await touch('touchMove',23,50);await expect(page.locator('#rotation-readout')).toContainText('30° · 15° snap');
 await touch('touchMove',24.4,100);await expect(page.locator('#rotation-readout')).toContainText('24° · 1° precision');await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});expect(await angle(page)).toBeCloseTo(24,3);await expect(page.locator('#rotation-readout')).toBeHidden();
});
test('cancelling touch rotation restores the shape and does not save an edit',async({page})=>{
 const at=await setup(page),cdp=await page.context().newCDPSession(page),before=await page.evaluate(()=>localStorage.getItem('vector-lab'));
 let p=at(0);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:p.x,y:p.y}]});p=at(38);await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:p.x,y:p.y}]});await expect(page.locator('#rotation-readout')).toContainText('45°');await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await expect(page.locator('#rotation-readout')).toBeHidden();expect(await page.evaluate(()=>localStorage.getItem('vector-lab'))).toBe(before);
 // Make another actual edit to prove the restored geometry, rather than just its saved snapshot.
 await page.keyboard.press('ArrowRight');expect(await angle(page)).toBeCloseTo(0,3);
});
