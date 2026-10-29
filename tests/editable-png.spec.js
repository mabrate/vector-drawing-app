import {test,expect,chromium} from '@playwright/test';

test('editable PNG download reimports as shapes or pixels, with cancel and undo',async()=>{
 const browser=await chromium.launch({channel:'chrome'});
 try{
 const page=await browser.newPage();await page.goto('/');
 page.once('dialog',d=>d.accept());
 await page.locator('#file').setInputFiles({name:'shapes.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><path d="M10 10H60V60H10Z" fill="red"/><text x="10" y="75" font-family="Arimo">Café</text></svg>')});
 await expect(page.locator('#status')).toContainText('SVG opened');
 const before=await page.evaluate(()=>localStorage.getItem('vector-lab'));
 await page.locator('#file-menu-button').click();const download=page.waitForEvent('download');await page.locator('#export-editable-png').click();await page.locator('#download-png').click();const file=await download;
 const bytes=Buffer.concat(await(await file.createReadStream()).toArray());expect(file.suggestedFilename()).toBe('shapes.png');
 const input={name:'shapes.png',mimeType:'image/png',buffer:bytes};
 await page.locator('#image-file').setInputFiles(input);await expect(page.locator('#png-import-dialog')).toBeVisible();await page.getByRole('button',{name:'Cancel',exact:true}).click();
 expect(await page.evaluate(()=>localStorage.getItem('vector-lab'))).toBe(before);
 await page.locator('#image-file').setInputFiles(input);await page.getByRole('button',{name:'Editable shapes',exact:true}).click();
 await expect(page.locator('#png-import-dialog')).not.toBeVisible();
 // The dialog hides before its asynchronous close handler finishes importing.
 await expect.poll(()=>page.evaluate(()=>(localStorage.getItem('vector-lab').match(/PointText/g)||[]).length)).toBe(2);
 await page.keyboard.press('Control+z');expect(await page.evaluate(()=>localStorage.getItem('vector-lab'))).toBe(before);
 await page.locator('#image-file').setInputFiles(input);await page.getByRole('button',{name:'Regular image',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>localStorage.getItem('vector-lab'))).toContain('Raster');
 const bad=await page.evaluate(async()=>{const {embedEditableSVG}=await import('/src/editable-png.js');const canvas=document.createElement('canvas');canvas.width=canvas.height=2;const png=await new Promise(r=>canvas.toBlob(r));const blob=await embedEditableSVG(png,'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');return Array.from(new Uint8Array(await blob.arrayBuffer()));});
 await page.locator('#image-file').setInputFiles({name:'unreadable.png',mimeType:'image/png',buffer:Buffer.from(bad)});
 await expect(page.locator('#png-import-dialog')).not.toBeVisible();
 await expect.poll(async()=>(await page.evaluate(()=>localStorage.getItem('vector-lab'))).match(/Raster/g)?.length).toBe(2);
 }finally{await browser.close();}
});

test('metadata reader safely handles missing, corrupt, unsupported and Unicode data',async()=>{
 const browser=await chromium.launch({channel:'chrome'});
 try{const page=await browser.newPage();await page.goto('/');
 const result=await page.evaluate(async()=>{
 const {embedEditableSVG,readEditableSVG}=await import('/src/editable-png.js');const canvas=document.createElement('canvas');canvas.width=canvas.height=2;const png=await new Promise(r=>canvas.toBlob(r));
 const svg='<svg xmlns="http://www.w3.org/2000/svg"><text>Café 🐈</text></svg>',editable=await embedEditableSVG(png,svg);
 const bytes=new Uint8Array(await editable.arrayBuffer());const corrupt=bytes.slice();corrupt[corrupt.length-17]^=1;
 // Recalculate CRC to test a genuinely unsupported envelope, not just corruption.
 const future=bytes.slice();const text=new TextDecoder().decode(future),index=text.indexOf('"version":1');future[index+10]=50;
 let pos=8;const view=new DataView(future.buffer);while(pos+12<=future.length){const len=view.getUint32(pos);if(String.fromCharCode(...future.subarray(pos+4,pos+8))==='tEXt'){let c=0xffffffff;for(const b of future.subarray(pos+4,pos+8+len)){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}view.setUint32(pos+8+len,(c^0xffffffff)>>>0);}pos+=12+len;}
 return {roundtrip:await readEditableSVG(editable),svg,missing:await readEditableSVG(png),corrupt:await readEditableSVG(new Blob([corrupt])),future:await readEditableSVG(new Blob([future])),truncated:await readEditableSVG(new Blob([bytes.subarray(0,25)]))};
 });expect(result.roundtrip).toBe(result.svg);for(const key of ['missing','corrupt','future','truncated'])expect(result[key]).toBeNull();
 }finally{await browser.close();}
});
