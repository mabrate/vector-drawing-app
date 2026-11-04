import {test,expect} from '@playwright/test';
test.use({launchOptions:{executablePath:'/usr/bin/google-chrome'}});
async function setup(page){
  await page.goto('/');page.once('dialog',d=>d.accept());
  await page.locator('#file').setInputFiles({name:'nodes.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><path d="M200 200h200v200H200z" fill="red"/></svg>')});
  await expect(page.locator('#status')).toContainText('SVG opened');await page.keyboard.press('Control+a');await page.locator('[data-tool=nodes]').click();
  return page.locator('#canvas').evaluate(c=>{const r=c.getBoundingClientRect(),z=Math.min((r.width-50)/1056,(r.height-50)/816);return{x:r.x+r.width/2+(200-528)*z,y:r.y+r.height/2+(200-408)*z,z};});
}
const saved=page=>page.evaluate(()=>localStorage.getItem('vector-lab'));
async function anchor(page){return page.evaluate(async()=>{const {default:paper}=await import(performance.getEntriesByType('resource').find(e=>e.name.includes('/deps/paper.js')).name);const p=paper.project.layers[1].children[0].firstSegment.point;return [p.x,p.y];});}

test('secondary clicks cannot start a node drag and context menus are suppressed during a drag',async({page})=>{
  const p=await setup(page),before=await saved(page),original=await anchor(page);
  await page.mouse.click(p.x,p.y,{button:'right'});await page.mouse.move(p.x+60,p.y+40);expect(await anchor(page)).toEqual(original);expect(await saved(page)).toBe(before);
  await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+30,p.y+20);
  expect(await page.locator('#canvas').evaluate(c=>!c.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,ctrlKey:true,button:2})))).toBe(true);
  await page.mouse.move(p.x+40,p.y+25);await page.mouse.up();const moved=await anchor(page);expect(moved).not.toEqual(original);
  await page.mouse.move(p.x+80,p.y+50);expect(await anchor(page)).toEqual(moved);await page.locator('#canvas-undo').click();expect(await anchor(page)).toEqual(original);
});

for(const interruption of ['lost capture','window blur','missing pointerup'])test(`node dragging recovers after ${interruption}`,async({page})=>{
  const p=await setup(page),before=await saved(page),original=await anchor(page);
  await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+30,p.y+20);const moved=await anchor(page);expect(moved).not.toEqual(original);
  if(interruption==='lost capture')await page.locator('#canvas').evaluate(c=>c.releasePointerCapture(1));
  else if(interruption==='window blur')await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  else await page.locator('#canvas').dispatchEvent('pointermove',{pointerId:1,pointerType:'mouse',buttons:0,clientX:p.x+60,clientY:p.y+40,bubbles:true});
  await page.mouse.up();await page.mouse.move(p.x+100,p.y+80);
  expect(await anchor(page)).toEqual(interruption==='missing pointerup'?moved:original);
  if(interruption==='missing pointerup'){expect(await saved(page)).not.toBe(before);await page.locator('#canvas-undo').click();}
  expect(await saved(page)).toBe(before);expect(await anchor(page)).toEqual(original);
  await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+20,p.y+15);await page.mouse.up();expect(await anchor(page)).not.toEqual(original);
});
