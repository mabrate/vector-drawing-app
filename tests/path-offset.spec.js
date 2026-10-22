import {test,expect} from '@playwright/test';
import paper from 'paper';
import {offsetPath} from '../src/path-offset.js';
test.use({launchOptions:{executablePath:'/usr/bin/google-chrome'}});
test('offset changes edge distance rather than scaling, preserves holes and rejects collapsed insets',()=>{
 paper.setup(new paper.Size(500,500));
 const rectangle=new paper.Path.Rectangle({rectangle:[100,100,200,100],insert:false});
 const out=offsetPath(paper,rectangle,10,'miter');expect(out.bounds.width).toBeCloseTo(220,3);expect(out.bounds.height).toBeCloseTo(120,3);expect(out.bounds.left).toBeCloseTo(90,3);
 const inset=offsetPath(paper,rectangle,-10);expect(inset.bounds.width).toBeCloseTo(180,3);expect(inset.bounds.height).toBeCloseTo(80,3);
 expect(()=>offsetPath(paper,rectangle,-60)).toThrow('entire path');expect(rectangle.bounds.width).toBe(200);
 const ring=new paper.CompoundPath({pathData:'M100 100h200v200h-200z M150 150v100h100v-100z',insert:false});
 const expanded=offsetPath(paper,ring,10,'miter');expect(expanded.contains(new paper.Point(145,200))).toBe(true);expect(expanded.contains(new paper.Point(200,200))).toBe(false);
 const concave=new paper.Path({segments:[[0,0],[100,0],[100,30],[30,30],[30,100],[0,100]],closed:true,insert:false});
 const concaveOut=offsetPath(paper,concave,10,'miter');expect(concaveOut.contains(new paper.Point(35,70))).toBe(true);expect(concaveOut.contains(new paper.Point(70,70))).toBe(false);
 rectangle.rotate(30);const rotated=offsetPath(paper,rectangle,10);expect(rotated.area).toBeGreaterThan(rectangle.area);
 paper.project.remove();
});
async function load(page,svg){page.once('dialog',d=>d.accept());await page.locator('#file').setInputFiles({name:'offset.svg',mimeType:'image/svg+xml',buffer:Buffer.from(svg)});await expect(page.locator('#status')).toContainText('SVG opened');await page.keyboard.press('Control+a');}
async function output(page){await page.locator('#save').click();const wait=page.waitForEvent('download');await page.locator('#download-svg').click();return Buffer.concat(await(await(await wait).createReadStream()).toArray()).toString();}
test('offset preview is reversible; applied geometry survives SVG reopen and Undo',async({page})=>{
 await page.goto('/');await load(page,'<svg xmlns="http://www.w3.org/2000/svg" width="1056" height="816"><path fill="orange" d="M100 100h200v100h-200z"/></svg>');
 const state=()=>page.evaluate(()=>localStorage.getItem('vector-lab'));const before=await state();
 await page.locator('#offset-path').click();await page.locator('#offset-distance').fill('-.1');await page.locator('#offset-dialog button[value=cancel]').click();expect(await state()).toBe(before);
 await page.locator('#offset-path').click();await page.locator('#offset-distance').fill('-.8');await expect(page.locator('#offset-apply')).toBeDisabled();await expect(page.locator('#offset-status')).toContainText('entire path');
 await page.locator('#offset-distance').fill('0.1');await expect(page.locator('#offset-apply')).toBeEnabled();await page.locator('#offset-join').selectOption('miter');await page.locator('#offset-apply').click();await expect(page.locator('#offset-dialog')).not.toBeVisible();
 const after=await state();expect(after).not.toBe(before);await page.locator('#undo').click();expect(await state()).toBe(before);await page.locator('#redo').click();expect(await state()).toBe(after);
 const svg=await output(page);await load(page,svg);await page.locator('#units').selectOption('px',{force:true});await expect(page.locator('#dimension-width')).toHaveValue('219.2');
});
test('offset copies keep originals and fit a touch-sized screen',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');
 await load(page,'<svg xmlns="http://www.w3.org/2000/svg" width="1056" height="816"><path fill="purple" fill-rule="evenodd" d="M100 100h200v200h-200z M150 150h100v100h-100z"/></svg>');
 await page.locator('#offset-path').click();await page.locator('#offset-distance').fill('0.1');await page.locator('#offset-keep').check();
 const bounds=await page.locator('#offset-dialog').boundingBox();expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(390);expect(bounds.height).toBeLessThan(844);
 await page.screenshot({path:'/tmp/vector-lab-offset-mobile.png'});
 await page.locator('#offset-apply').click();await page.reload();
 const items=await page.evaluate(()=>JSON.parse(localStorage.getItem('vector-lab'))[1].children);expect(items).toHaveLength(2);expect(items[0][1].fillRule).toBe('evenodd');
 const svg=await output(page);expect(svg).not.toContain('offset-preview');await load(page,svg);
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('vector-lab'))[1].children.length)).toBe(2);
});
