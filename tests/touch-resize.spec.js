import {test,expect} from '@playwright/test';
test.use({hasTouch:true,launchOptions:{executablePath:'/usr/bin/google-chrome'}});
async function setup(page){
 await page.goto('/');page.once('dialog',d=>d.accept());await page.locator('#file').setInputFiles({name:'resize.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><path d="M300 300h200v100H300z" fill="orange"/></svg>')});await expect(page.locator('#status')).toContainText('SVG opened');
 await page.locator('#file-menu-button').click();await page.locator('#settings').click();await page.locator('#snapping').uncheck();await page.locator('#settings-done').click();
 const p=await point(page,400,350);await page.touchscreen.tap(p.x,p.y);
}
async function point(page,x,y){return page.locator('#canvas').evaluate(async(c,{x,y})=>{const {default:paper}=await import(performance.getEntriesByType('resource').find(e=>e.name.includes('/deps/paper.js')).name),p=paper.view.projectToView(new paper.Point(x,y)),r=c.getBoundingClientRect();return{x:r.x+p.x,y:r.y+p.y};},{x,y});}
async function bounds(page){return page.evaluate(async()=>{const {default:paper}=await import(performance.getEntriesByType('resource').find(e=>e.name.includes('/deps/paper.js')).name),b=paper.project.layers[1].children[0].bounds;return {width:b.width,height:b.height,left:b.left,top:b.top,right:b.right,bottom:b.bottom};});}
const cases=[
 ['northwest',[300,300],[220,290],[280,140],['right','bottom']],
 ['northeast',[500,300],[580,290],[280,140],['left','bottom']],
 ['southeast',[500,400],[580,410],[280,140],['left','top']],
 ['southwest',[300,400],[220,410],[280,140],['right','top']],
 ['east',[500,350],[580,380],[280,100],['left','top']],
 ['west',[300,350],[220,380],[280,100],['right','top']],
 ['north',[400,300],[430,260],[200,140],['left','bottom']],
 ['south',[400,400],[430,440],[200,140],['left','top']]
];
for(const [name,from,to,size,fixed] of cases)test(`touch ${name} handle ${name.length>5?'preserves proportions':'resizes one dimension'}`,async({page})=>{
 await setup(page);const before=await page.evaluate(()=>localStorage.getItem('vector-lab')),initial=await bounds(page),cdp=await page.context().newCDPSession(page),start=await point(page,...from),end=await point(page,...to);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,...start}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,...end}]});
 const during=await bounds(page);expect(during.width).toBeCloseTo(size[0],3);expect(during.height).toBeCloseTo(size[1],3);for(const key of fixed)expect(during[key]).toBeCloseTo(initial[key],3);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});expect(await bounds(page)).toEqual(during);
 await page.locator('#canvas-undo').click();expect(await page.evaluate(()=>localStorage.getItem('vector-lab'))).toBe(before);
});
for(const constrained of [false,true])test(`mouse corner resizing keeps its existing ${constrained?'Ctrl-constrained':'free'} behavior on a touch-capable device`,async({page})=>{
 await setup(page);const start=await point(page,500,400),end=await point(page,580,410);await page.mouse.move(start.x,start.y);await page.mouse.down();if(constrained)await page.keyboard.down('Control');await page.mouse.move(end.x,end.y);await page.mouse.up();if(constrained)await page.keyboard.up('Control');
 const b=await bounds(page);expect(b.width).toBeCloseTo(280,3);expect(b.height).toBeCloseTo(constrained?140:110,3);
});
