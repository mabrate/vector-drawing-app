import {test,expect,chromium} from '@playwright/test';

test('background and trace settings persist across cancel, images, reload and reset defaults',async()=>{
 const browser=await chromium.launch({channel:'chrome'});
 try{
 const page=await browser.newPage();await page.goto('/');
 const data=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=160;c.height=80;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,160,80);ctx.fillStyle='red';ctx.fillRect(30,20,100,40);return c.toDataURL().split(',')[1];});
 const insert=()=>page.locator('#image-file').setInputFiles({name:'subject.png',mimeType:'image/png',buffer:Buffer.from(data,'base64')});await insert();
 await page.locator('#remove-background').click();await page.locator('#background-tolerance').fill('27');await page.locator('#background-size').fill('30');await page.locator('#background-mode').selectOption('keep');await page.locator('#background-preview').check();await page.locator('#background-edges').click();await page.locator('#background-cancel').click();
 await insert();await page.locator('#remove-background').click();await expect(page.locator('#background-tolerance')).toHaveValue('27');await expect(page.locator('#background-mode')).toHaveValue('keep');await expect(page.locator('#background-preview')).toBeChecked();await expect(page.locator('#background-apply')).toBeDisabled();await page.locator('#background-cancel').click();
 await page.locator('#trace-image').click();await page.locator('#trace-mode').selectOption('pixel');await page.locator('#trace-pixel-sizing').selectOption('block');await page.locator('#trace-block').fill('8');await page.locator('#trace-colors').selectOption('8');await page.locator('#trace-white').uncheck();await page.locator('#trace-brush-mode').selectOption('include');await page.locator('#trace-brush-size').fill('35');await page.locator('#trace-cancel').click();
 await page.reload();await page.keyboard.press('Control+a'); // Select only the last inserted image.
 await page.keyboard.press('Escape');await insert();
 await page.locator('#trace-image').click();await expect(page.locator('#trace-mode')).toHaveValue('pixel');await expect(page.locator('#trace-pixel-sizing')).toHaveValue('block');await expect(page.locator('#trace-block')).toHaveValue('8');await expect(page.locator('#trace-colors')).toHaveValue('8');await expect(page.locator('#trace-white')).not.toBeChecked();await expect(page.locator('#trace-brush-size')).toHaveValue('35');
 await page.locator('#trace-reset').click();await expect(page.locator('#trace-mode')).toHaveValue('mono');await expect(page.locator('#trace-block')).toHaveValue('4');await page.locator('#trace-cancel').click();
 await page.locator('#remove-background').click();await expect(page.locator('#background-tolerance')).toHaveValue('27');await expect(page.locator('#background-tolerance-value')).toHaveText('27%');await expect(page.locator('#background-size-value')).toHaveText('30 px');
 await page.locator('#background-edges').click();await expect(page.locator('#background-apply')).toBeEnabled();await page.locator('#background-reset').click();await expect(page.locator('#background-apply')).toBeEnabled();await expect(page.locator('#background-tolerance')).toHaveValue('15');await expect(page.locator('#background-size')).toHaveValue('16');await expect(page.locator('#background-mode')).toHaveValue('smart');await expect(page.locator('#background-preview')).not.toBeChecked();await page.locator('#background-cancel').click();
 await page.reload();await insert();await page.locator('#remove-background').click();await expect(page.locator('#background-tolerance')).toHaveValue('15');await page.locator('#background-cancel').click();await page.locator('#trace-image').click();await expect(page.locator('#trace-mode')).toHaveValue('mono');await expect(page.locator('#trace-pixel-sizing')).toHaveValue('detail');
 }finally{await browser.close();}
});

test('invalid saved values and unavailable storage do not break preference controls',async()=>{
 const browser=await chromium.launch({channel:'chrome'});
 try{const page=await browser.newPage();await page.goto('/');
 const result=await page.evaluate(async()=>{
 const {toolPreferences}=await import('/src/tool-preferences.js');const number=document.createElement('input');number.type='number';number.min='1';number.max='256';number.value='4';const select=document.createElement('select');select.innerHTML='<option value="detail">Detail</option><option value="block">Block</option>';
 localStorage.setItem('test-prefs',JSON.stringify({version:1,values:{number:'99999',select:'unknown'}}));const preferences=toolPreferences('test-prefs',{number,select});const values=[number.value,select.value];
 const original=Storage.prototype.setItem;Storage.prototype.setItem=()=>{throw Error('Unavailable');};try{number.value='8';preferences.save();preferences.reset();}finally{Storage.prototype.setItem=original;}
 localStorage.setItem('test-prefs','broken');toolPreferences('test-prefs',{number,select});return {values,reset:number.value};
 });expect(result).toEqual({values:['4','detail'],reset:'4'});
 }finally{await browser.close();}
});
