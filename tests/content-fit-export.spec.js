import {test,expect} from '@playwright/test';
test.use({launchOptions:{executablePath:'/usr/bin/google-chrome'}});
async function open(page,svg){await page.goto('/');page.once('dialog',d=>d.accept());await page.locator('#file').setInputFiles({name:'content.svg',mimeType:'image/svg+xml',buffer:Buffer.from(svg)});await expect(page.locator('#status')).toContainText('SVG opened');}
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><path d="M-10 10H30V30H-10Z" fill="red" stroke="black" stroke-width="4"/><path visibility="hidden" d="M200 200H300V300H200Z"/></svg>';
test('fit canvas includes outlines, ignores hidden artwork and supports undo',async({page})=>{
 await open(page,svg);const before=await page.evaluate(()=>localStorage.getItem('vector-lab'));
 await page.locator('#file-menu-button').click();await page.locator('#settings').click();await page.locator('#units').selectOption('px');await page.locator('#fit-canvas-content').click();
 await expect(page.locator('#page-width')).toHaveValue('44');await expect(page.locator('#page-height')).toHaveValue('24');
 await page.locator('#settings-done').click();await page.locator('#undo').click();expect(await page.evaluate(()=>localStorage.getItem('vector-lab'))).toBe(before);
});
for(const editable of [false,true])test(`selected PNG fits selection and excludes other artwork (editable=${editable})`,async({page})=>{
 await open(page,'<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><path d="M0 0H120V80H0Z" fill="blue"/></svg>');
 await page.locator('[data-tool="rectangle"]').click();const box=await page.locator('canvas').first().boundingBox();
 await page.mouse.move(box.x+box.width/2-30,box.y+box.height/2-20);await page.mouse.down();await page.mouse.move(box.x+box.width/2+30,box.y+box.height/2+20);await page.mouse.up();
 const before=await page.evaluate(()=>localStorage.getItem('vector-lab'));
 await page.locator('#file-menu-button').click();await page.locator(editable?'#export-editable-png':'#export-png').click();await page.locator('#png-export-selected').check();
 const downloading=page.waitForEvent('download');await page.locator('#download-png').click();const file=await downloading,bytes=Buffer.concat(await(await file.createReadStream()).toArray());
 expect(bytes.readUInt32BE(16)).toBeLessThan(120);expect(bytes.readUInt32BE(20)).toBeLessThan(80);
 const data=await page.evaluate(async base64=>{const blob=await(await fetch('data:image/png;base64,'+base64)).blob();const {readEditableSVG}=await import('/src/editable-png.js');const svg=await readEditableSVG(blob);const image=await createImageBitmap(blob),c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);const pixels=ctx.getImageData(0,0,c.width,c.height).data;let blue=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]===0&&pixels[i+1]===0&&pixels[i+2]===255&&pixels[i+3])blue++;return {svg,blue};},bytes.toString('base64'));
 expect(data.blue).toBe(0);if(editable){expect(data.svg).toBeTruthy();expect((data.svg.match(/<path\b/g)||[]).length).toBe(1);}else expect(data.svg).toBeNull();
 expect(await page.evaluate(()=>localStorage.getItem('vector-lab'))).toBe(before);
});
