import {test,expect} from '@playwright/test';
import paper from 'paper';
import {strokeToPath} from '../src/stroke-to-path.js';
import {pathAction} from './helpers/path-actions.js';
test.use({launchOptions:{executablePath:'/usr/bin/google-chrome'}});

test('stroke outlines honor caps, holes, miters and bevel joins',()=>{
 paper.setup(new paper.Size(1000,800));
 for(const [cap,left,width] of [['butt',100,100],['round',90,120],['square',90,120]]){
  const line=new paper.Path({segments:[[100,100],[200,100]],strokeColor:'#ff0000',strokeWidth:20,strokeCap:cap,insert:false});
  const outline=strokeToPath(paper,line);expect(outline.strokeColor).toBeNull();expect(outline.fillColor.toCSS(true)).toBe('#ff0000');expect(outline.bounds.left).toBeCloseTo(left,2);expect(outline.bounds.width).toBeCloseTo(width,2);expect(outline.bounds.height).toBeCloseTo(20,2);
 }
 const path=new paper.Path({segments:[[100,100],[200,100],[200,200]],strokeColor:'black',strokeWidth:20,strokeJoin:'miter',insert:false});
 const miter=strokeToPath(paper,path);expect(miter.contains([209,91])).toBe(true);path.strokeJoin='bevel';const bevel=strokeToPath(paper,path);expect(bevel.contains([209,91])).toBe(false);expect(bevel.contains([204,96])).toBe(true);
 const box=new paper.Path.Rectangle({rectangle:[100,100,100,100],strokeColor:'black',strokeWidth:20,fillColor:null,insert:false});const ring=strokeToPath(paper,box);expect(ring.contains([100,150])).toBe(true);expect(ring.contains([150,150])).toBe(false);
});

const cleanOutlineFixtures=[
 ['open curve','M120 120C220 20 250 240 380 130',28,1],
 ['long curve','M100 100C400 100 300 800 700 700',50,1],
 ['closed curve','M100 100C500 120 760 700 400 800Z',36,2],
 ['oval','M100 400C100 10 800 10 800 400C800 790 100 790 100 400Z',32,2],
 ['branches','M240 180C320 180 360 330 420 450C450 510 470 600 450 650 M420 450L640 300 M640 170L640 300C640 420 730 610 590 670',28,1],
];
for(const join of ['miter','round','bevel'])test(`${join} curved outlines contain only real boundary nodes and retain intended holes`,()=>{
 paper.setup(new paper.Size(1000,1000));
 for(const [name,d,width,count] of cleanOutlineFixtures){
  const source=new paper.CompoundPath({pathData:d,strokeColor:'#000000',strokeWidth:width,strokeJoin:join,fillColor:null,insert:false});
  const outline=strokeToPath(paper,source),contours=outline.children||[outline];
  expect(contours.length,`${name}: boundary count`).toBe(count);
  for(const contour of contours)for(const segment of contour.segments){
   const distance=Math.min(...source.children.map(path=>path.getNearestPoint(segment.point).getDistance(segment.point)));
   expect(distance,`${name}: node must stay on the stroke boundary`).toBeGreaterThan(width/2-.12);
  }
 }
});

async function load(page,content){page.once('dialog',d=>d.accept());await page.locator('#file').setInputFiles({name:'stroke.svg',mimeType:'image/svg+xml',buffer:Buffer.from(content)});await expect(page.locator('#status')).toContainText('SVG opened');await page.keyboard.press('Control+a');}
async function svg(page){await page.locator('#save').click();const wait=page.waitForEvent('download');await page.locator('#download-svg').click();return Buffer.concat(await(await(await wait).createReadStream()).toArray()).toString();}
async function difference(page,before,after){return page.evaluate(async({before,after})=>{
 async function render(source){const image=new Image();image.src='data:image/svg+xml,'+encodeURIComponent(source);await image.decode();const c=document.createElement('canvas');c.width=1056;c.height=816;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(image,0,0,1056,816);return ctx.getImageData(0,0,c.width,c.height).data;}
 const a=await render(before),b=await render(after);let error=0,ink=0;for(let i=0;i<a.length;i+=4){const diff=Math.max(...[0,1,2].map(j=>Math.abs(a[i+j]-b[i+j])));error+=diff/255;if(Math.min(...[0,1,2].map(j=>Math.min(a[i+j],b[i+j])))<250)ink++;}return error/Math.max(1,ink);
},{before,after});}
const cases={
 'branched curves':'<path d="M240 180C320 180 360 330 420 450C450 510 470 600 450 650 M420 450L640 300 M640 170L640 300C640 420 730 610 590 670"/>',
 'butt cap':'<path d="M220 240L650 240" stroke-linecap="butt"/>',
 'round cap and joins':'<path d="M220 240L450 220L520 420" stroke-linecap="round" stroke-linejoin="round"/>',
 'square caps and bevels':'<path d="M220 240L450 220L520 420" stroke-linecap="square" stroke-linejoin="bevel"/>',
 'miter limit':'<path d="M220 400L450 220L400 400" stroke-linejoin="miter" stroke-miterlimit="2"/>',
 'curves and nonuniform transform':'<path d="M120 120C220 20 250 240 380 130" transform="matrix(1.2 .3 .25 1.7 40 80)" stroke-linecap="round"/>',
 'non-scaling stroke':'<path d="M120 120L380 130" transform="matrix(1.2 .3 .25 1.7 40 80)" vector-effect="non-scaling-stroke" stroke-linecap="round"/>',
 'closed contours and holes':'<path d="M220 220h400v300H220z M300 300h200v100H300z"/>',
 'custom dashes and offset':'<path d="M220 240C320 120 450 500 650 240" stroke-dasharray="24 8 12" stroke-dashoffset="11" stroke-linecap="round"/>',
 'closed dashed seam':'<path d="M220 220h300v200H220z" stroke-dasharray="63 21" stroke-dashoffset="20" stroke-linecap="round"/>',
 'dots':'<path d="M220 240L650 240" stroke-dasharray="0 54" stroke-linecap="round"/>',
 'fill and opacity':'<path d="M220 220h300v200H220z" fill="#fa9231" opacity=".55"/>',
 'transformed gradient':'<defs><linearGradient id="t" gradientUnits="userSpaceOnUse" x1="120" y1="120" x2="380" y2="130"><stop stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient></defs><path d="M120 120L380 130" transform="matrix(1.2 .3 .25 1.7 40 80)" stroke="url(#t)" stroke-linecap="round"/>',
 'gradient':'<defs><linearGradient id="g" gradientUnits="userSpaceOnUse" x1="220" y1="240" x2="650" y2="240"><stop stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient></defs><path d="M220 240L650 240" stroke="url(#g)" stroke-linecap="round"/>',
};
for(const [name,content] of Object.entries(cases))test(`Stroke to Path preserves ${name}, undo, recovery and SVG reopening`,async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');const original=`<svg xmlns="http://www.w3.org/2000/svg" width="1056" height="816"><g fill="none" stroke="#235a89" stroke-width="28">${content}</g></svg>`;await load(page,original);
 const snapshot=()=>page.evaluate(()=>{const ids=new Map();return localStorage.getItem('vector-lab').replace(/"#\d+"/g,id=>{if(!ids.has(id))ids.set(id,ids.size);return '"#'+ids.get(id)+'"';});}),beforeState=await snapshot(),before=await svg(page);

 await pathAction(page,'#stroke-to-path');await expect(page.locator('#status')).toContainText('Stroke converted');
 if(name==='branched curves'){
  expect(await page.evaluate(async()=>{const {default:paper}=await import(performance.getEntriesByType('resource').find(e=>e.name.includes('/deps/paper.js')).name);const item=paper.project.layers[1].firstChild;return item.children?.length||1;})).toBe(1);
  await page.locator('[data-tool=nodes]').click();
  await page.screenshot({path:'/tmp/vector-lab-clean-stroke-nodes.png'});
 }
 const afterState=await snapshot(),after=await svg(page);expect(await difference(page,before,after)).toBeLessThan(.025);
 expect(await page.evaluate(source=>[...new DOMParser().parseFromString(source,'image/svg+xml').querySelectorAll('path')].every(p=>!p.getAttribute('stroke')||p.getAttribute('stroke')==='none'),after)).toBe(true);
 await page.locator('#canvas-undo').click();expect(await snapshot()).toBe(beforeState);await page.locator('#canvas-redo').click();expect(await snapshot()).toBe(afterState);
 await page.reload();expect(await snapshot()).toBe(afterState);await load(page,after);expect(await difference(page,before,await svg(page))).toBeLessThan(.025);expect(errors).toEqual([]);
});

test('a failed conversion keeps every selected original intact',async({page})=>{
 await page.goto('/');await load(page,'<svg xmlns="http://www.w3.org/2000/svg"><path d="M100 100h200" fill="none" stroke="blue" stroke-width="10"/><path d="M100 200h200" fill="none" stroke="red" stroke-width="10" stroke-dasharray=".00001 .00001"/></svg>');
 const before=await page.evaluate(()=>localStorage.getItem('vector-lab'));
 await pathAction(page,'#stroke-to-path');await expect(page.locator('#status')).toContainText(/too (many|complex)/);
 expect(await page.evaluate(()=>localStorage.getItem('vector-lab'))).toBe(before);
 expect(await page.evaluate(async()=>{const {default:paper}=await import(performance.getEntriesByType('resource').find(e=>e.name.includes('/deps/paper.js')).name);return paper.project.layers[1].children.length;})).toBe(2);
});
