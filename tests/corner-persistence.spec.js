import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
test.use({launchOptions:{executablePath:'/usr/bin/google-chrome'},viewport:{width:1280,height:900}});
async function load(page,svg){page.once('dialog',d=>d.accept());await page.locator('#file').setInputFiles({name:'drawing.svg',mimeType:'image/svg+xml',buffer:Buffer.from(svg)});await expect(page.locator('#status')).toContainText('SVG opened');}
async function nodes(page){await page.locator('#canvas').focus();await page.keyboard.press('Control+a');await page.keyboard.press('n');await page.keyboard.press('Control+a');await page.locator('[data-panel=align]').click();}
async function save(page,simple=false){await page.locator('#save').click();await page.locator('#vector-text').setChecked(simple);await expect(page.locator('#export-status')).toHaveText('Ready to save or share.');const waiting=page.waitForEvent('download');await page.locator('#download-svg').click();const file=await waiting;const text=await readFile(await file.path(),'utf8');await page.keyboard.press('Escape');return text;}
const fixture='<svg xmlns="http://www.w3.org/2000/svg"><path transform="translate(10.123 30.456) rotate(17)" d="M100 200L200 200L200 300" fill="none" stroke="black"/></svg>';
for(const [name,drawing] of [['straight',fixture],['curved',fixture.replace('M100 200L200 200L200 300','M100 200C120 200 170 190 200 200L200 300')]])test(`fillets survive reload and repeated SVG reopening and remain adjustable: ${name}`,async({page})=>{
 await page.goto('/');await load(page,drawing);await nodes(page);await page.locator('#corner-amount').fill('0.234567');await page.locator('#apply-corner').click();
 await page.reload();await nodes(page);expect(Number(await page.locator('#corner-amount').inputValue())).toBeCloseTo(0.234567,6);
 await page.locator('#corner-amount').fill('0.31');await page.locator('#apply-corner').click();
 for(let i=0;i<2;i++){const svg=await save(page);expect(svg).toContain('cornerEffect');await load(page,svg);await nodes(page);expect(Number(await page.locator('#corner-amount').inputValue())).toBeCloseTo(i?0.27:0.31,6);await page.locator('#corner-amount').fill('0.27');await page.locator('#apply-corner').click();}
 await page.screenshot({path:'/tmp/persistent-fillet-markers.png'});
 const svg=await save(page,true);expect(svg).not.toMatch(/cornerEffect|data-paper-data|<metadata|<text/);expect(svg).toContain('<path');
 await load(page,svg);await nodes(page);await expect(page.locator('#reset-corner')).toBeDisabled();
 expect(await page.evaluate(()=>localStorage.getItem('vector-lab'))).not.toContain('cornerEffect');
});
test('simple paths export converts text and removes reversible joined-shape data without changing artwork',async({page})=>{
 await page.goto('/');await load(page,'<svg xmlns="http://www.w3.org/2000/svg"><path d="M100 100h100v100h-100z"/><path d="M150 150h100v100h-100z"/></svg>');
 await page.keyboard.press('Control+a');await page.locator('[data-boolean=unite]').click();
 await page.locator('[data-tool=text]').click();const box=await page.locator('#canvas').boundingBox();await page.mouse.click(box.x+box.width/2,box.y+box.height/2);await page.locator('#text-content').fill('Laser');await page.locator('#apply-text').click();
 const before=await page.evaluate(()=>localStorage.getItem('vector-lab'));
 const editable=await save(page);expect(editable).toContain('<text');expect(editable).toContain('vector-lab-shape-building');
 const simple=await save(page,true);expect(simple).not.toMatch(/<text|<metadata|data-paper-data|shapeBuild|cornerEffect/);expect(simple).toContain('<path');
 expect(await page.evaluate(()=>localStorage.getItem('vector-lab'))).toBe(before);
 await load(page,simple);expect(await page.evaluate(()=>localStorage.getItem('vector-lab'))).not.toMatch(/PointText|shapeBuild|cornerEffect/);
});
