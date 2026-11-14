import {test,expect} from '@playwright/test';
import {open,choose,idle,addBox,preview,stored,snapshot} from './model3d-helpers.js';
test.use({launchOptions:{executablePath:'/usr/bin/google-chrome',args:['--enable-unsafe-swiftshader']},hasTouch:true});
test.setTimeout(120000);
const boundary=page=>page.locator('#model3d-boundaries button').filter({hasText:'Outside rim 1'});
async function start(page){await open(page);await addBox(page);await choose(page,'chamfer');}
async function rimPoint(page){
  await page.locator('#model3d-viewer').scrollIntoViewIfNeeded();
  const box=await page.locator('#model3d-viewer canvas').boundingBox(),tan=Math.tan(40*Math.PI/360),span=160*25.4/96,height=120*25.4/96,distance=span/(2*tan)*1.5/Math.min(box.width/box.height,1);
  return {x:box.x+box.width/2,y:box.y+box.height/2-height*box.height/(4*(distance-5)*tan),box};
}

test('mouse and touch snap near a visible rim, hover previews a boundary, and misses keep selection',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await start(page);const before=await snapshot(page);await page.locator('[data-model-view=top]').click();
  let p=await rimPoint(page);await page.mouse.move(p.x,p.y+9);await expect(page.locator('.model3d-edge-hint')).toBeVisible();await expect(page.locator('.model3d-edge-hint')).toContainText('Outside rim');
  await page.mouse.click(p.x,p.y+9);await expect(page.locator('#model3d-edge-count')).toHaveText('4 edges selected.');await expect(boundary(page)).toHaveAttribute('aria-pressed','true');
  await page.mouse.click(p.box.x+8,p.box.y+8);await expect(page.locator('#model3d-edge-count')).toHaveText('4 edges selected.');
  await page.locator('#model3d-clear-edges').click();p=await rimPoint(page);await page.touchscreen.tap(p.x,p.y+20);await expect(page.locator('#model3d-edge-count')).toHaveText('4 edges selected.');
  await page.locator('#model3d-edge-advanced').locator('summary').click();await page.locator('#model3d-edge-mode').selectOption('individual');p=await rimPoint(page);await page.mouse.click(p.x,p.y+9);await expect(page.locator('#model3d-edge-count')).toHaveText('1 edge selected.');
  await page.locator('#model3d-edge-mode').selectOption('connected');await boundary(page).focus();await page.keyboard.press('Enter');await expect(page.locator('#model3d-edge-count')).toHaveText('4 edges selected.');
  await page.locator('#model3d-cancel').click();expect(await snapshot(page)).toBe(before);expect(errors).toEqual([]);
});

test('named upper and lower rims are selectable without precise picking and fit a phone',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await start(page);await expect(page.locator('#model3d-edge-advanced')).not.toHaveAttribute('open','');
  await boundary(page).click();await expect(page.locator('#model3d-boundary-summary')).toHaveText('1 complete boundary selected.');await page.locator('#model3d-focus-edges').click();
  await page.locator('#model3d-boundary-filter').selectOption('lower');await boundary(page).click();await expect(page.locator('#model3d-edge-count')).toHaveText('8 edges selected.');
  await boundary(page).click();await expect(page.locator('#model3d-edge-count')).toHaveText('4 edges selected.');await page.locator('#model3d-boundary-filter').selectOption('upper');
  await page.setViewportSize({width:390,height:844});await boundary(page).scrollIntoViewIfNeeded();expect((await boundary(page).boundingBox()).height).toBeGreaterThanOrEqual(44);
  expect(await page.locator('#model3d-dialog').evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);await page.screenshot({path:'/tmp/vector-lab-easy-rim-mobile.png'});
  await page.locator('#model3d-edge-size').fill('.5');await preview(page);await page.locator('#model3d-apply-tool').click();await page.locator('#model3d-apply').click();expect((await stored(page)).features[1].edges).toHaveLength(4);expect(errors).toEqual([]);
});

test('one button selects all design/base junctions at the chosen height',async({page})=>{
  const profile=(x,y,w,h)=>{const p=[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];return [{outer:p.map((a,i)=>[a,a,p[(i+1)%4],p[(i+1)%4]]),holes:[]}];};
  const feature=(id,operation,start,height,shape)=>({id,name:id,kind:'extrusion',operation,target:operation==='new'?null:'base',start,height,draft:0,profile:shape});
  const model={version:1,features:[feature('base','new',0,3,profile(-10,-10,20,20)),feature('left','join',3,5,profile(-6,-2,4,4)),feature('right','join',3,5,profile(2,-2,4,4))]};
  await open(page,`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><metadata id="vector-lab-model3d">${JSON.stringify(model)}</metadata></svg>`);await choose(page,'chamfer');await expect(page.locator('#model3d-boundary-filter')).toHaveValue('junctions');
  const all=page.locator('#model3d-boundaries button').filter({hasText:'All junctions at Z 3 mm'});await all.click();await expect(page.locator('#model3d-edge-count')).toHaveText('8 edges selected.');await expect(page.locator('#model3d-boundary-summary')).toHaveText('2 complete boundaries selected.');
  await all.click();await expect(page.locator('#model3d-preview')).toBeDisabled();await all.click();await preview(page);await page.locator('#model3d-apply-tool').click();await expect(page.locator('#model3d-summary')).toContainText('1 solid group');
});

test('orange short-segment warnings remain visible over a selected pink boundary',async({page})=>{
  const points=[[0,0],[.01,.0001],[20,0],[20,20],[0,20]],model={version:1,features:[{id:'small-edge',name:'Small edge',kind:'extrusion',operation:'new',target:null,start:0,height:10,draft:0,profile:[{outer:points.map((p,i)=>[p,p,points[(i+1)%points.length],points[(i+1)%points.length]]),holes:[]}]}]};
  await open(page,`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><metadata id="vector-lab-model3d">${JSON.stringify(model)}</metadata></svg>`);await choose(page,'chamfer');await boundary(page).click();await page.locator('#model3d-chamfer-highlight').click();await page.locator('#model3d-focus-edges').click();
  const png=await page.locator('#model3d-viewer canvas').screenshot();
  const orange=await page.evaluate(async base64=>{
    const image=new Image();image.src='data:image/png;base64,'+base64;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const context=canvas.getContext('2d');context.drawImage(image,0,0);
    const {data}=context.getImageData(0,0,canvas.width,canvas.height);let pixels=0;for(let i=0;i<data.length;i+=4)if(data[i]>180&&data[i+1]>65&&data[i+1]<170&&data[i+2]<80)pixels++;return pixels;
  },png.toString('base64'));
  expect(orange).toBeGreaterThan(5);
});
