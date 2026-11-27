import {test,expect} from '@playwright/test';
import {pathAction,openPathMenu} from './helpers/path-actions.js';
test.use({launchOptions:{executablePath:'/usr/bin/google-chrome'}});
async function load(page,content){
 await expect(page.locator('#browser-recovery')).toHaveAttribute('data-state','saved');
 page.once('dialog',d=>d.accept());await page.locator('#file').setInputFiles({name:'paths.svg',mimeType:'image/svg+xml',buffer:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1056" height="816">${content}</svg>`)});
 await expect(page.locator('#status')).toContainText('SVG opened');await page.keyboard.press('Control+a');
}
const state=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('vector-lab'))[1].children);
const shapes='<path d="M200 200h150v100H200z" fill="red"/><path d="M280 240h150v100H280z" fill="blue"/>';
for(const viewport of [{width:1280,height:800},{width:390,height:844},{width:640,height:480}])test(`Path menu is accessible and stays inside the screen at ${viewport.width}`,async({page})=>{
 await page.setViewportSize(viewport);await page.goto('/');await openPathMenu(page);
 await expect(page.locator('#path-menu button')).toHaveCount(6);
 await expect(page.locator('#path-menu kbd')).toHaveText(['Shift+U','Shift+S','Shift+I','Shift+O','Shift+P','Shift+T']);
 await expect(page.getByRole('menuitem',{name:'Union',exact:true})).toHaveAttribute('aria-keyshortcuts','Shift+U');
 for(const action of await page.locator('#path-menu button').all())await expect(action).toBeDisabled();
 await page.keyboard.press('Escape');await expect(page.locator('#path-menu')).toBeHidden();await expect(page.locator('#path-menu-button')).toBeFocused();
 await load(page,'<path d="M200 200h150v100H200z" stroke="black" stroke-width="8" fill="red"/><path d="M280 240h150v100H280z" fill="blue"/>');
 await openPathMenu(page);
 for(const action of ['unite','subtract','intersect'])await expect(page.locator(`#path-menu [data-boolean=${action}]`)).toBeEnabled();
 await expect(page.locator('#path-menu #offset-path')).toBeEnabled();await expect(page.locator('#stroke-to-path')).toBeDisabled();
 expect(await page.locator('.context [data-boolean],.context #offset-path').count()).toBe(0);
 const bounds=await page.locator('#path-menu').boundingBox();expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.y).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(viewport.width);expect(bounds.y+bounds.height).toBeLessThanOrEqual(viewport.height);
 await page.screenshot({path:`/tmp/vector-lab-path-menu-${viewport.width}.png`});
 await page.keyboard.press('Escape');await page.locator('#path-menu-button').press('ArrowDown');await expect(page.locator('[data-boolean=unite]')).toBeFocused();await page.keyboard.press('ArrowDown');await expect(page.locator('[data-boolean=subtract]')).toBeFocused();await page.keyboard.press('Enter');
 await expect(page.locator('#path-menu')).toBeHidden();await expect(page.locator('#status')).toContainText('Shapes combined');
 await openPathMenu(page);await page.locator('#canvas').click({position:{x:30,y:30}});await expect(page.locator('#path-menu')).toBeHidden();
});
for(const operation of ['unite','subtract','intersect'])test(`Path menu ${operation} keeps the original reversible operation`,async({page})=>{
 await page.goto('/');await load(page,shapes);
 await pathAction(page,`[data-boolean=${operation}]`);
 expect(await state(page)).toHaveLength(1);expect((await state(page))[0][1].data.shapeBuild.operation).toBe(operation);
 await page.locator('#canvas-undo').click();expect(await state(page)).toHaveLength(2);await page.locator('#canvas-redo').click();expect(await state(page)).toHaveLength(1);
});

for(const [key,operation] of [['U','unite'],['S','subtract'],['I','intersect']])test(`Shift+${key} runs ${operation} and Shift+B breaks the result apart`,async({page})=>{
 await page.goto('/');await load(page,shapes);
 const originals=await state(page);
 if(operation==='subtract')await page.locator('#path-menu-button').press('ArrowDown');
 await page.keyboard.press(`Shift+${key}`);
 await expect(page.locator('#path-menu')).toBeHidden();
 if(operation==='subtract')await expect(page.locator('#path-menu-button')).toBeFocused();
 const combined=await state(page);
 expect(combined).toHaveLength(1);expect(combined[0][1].data.shapeBuild.operation).toBe(operation);
 await expect(page.locator('#break-apart')).toHaveAttribute('aria-keyshortcuts','Shift+B');
 await page.keyboard.press('Shift+B');
 await expect(page.locator('#status')).toContainText('Original shapes restored');
 expect(await state(page)).toMatchObject(originals.map(([type,{segments,fillColor}])=>[type,{segments,fillColor}]));
 await page.keyboard.press('Control+z');expect(await state(page)).toEqual(combined);
});

test('path shortcuts honor open dialogs and text fields',async({page})=>{
 await page.goto('/');
 await load(page,'<path d="M200 200h150v100H200z" stroke="black" stroke-width="8" fill="none"/>');
 const outlined=await state(page);
 await page.keyboard.press('Shift+O');
 await expect(page.locator('#offset-dialog')).toBeVisible();
 await page.keyboard.press('Shift+P');expect(await state(page)).toEqual(outlined);
 await page.keyboard.press('Escape');await expect(page.locator('#offset-dialog')).toBeHidden();
 await page.keyboard.press('Shift+P');await expect(page.locator('#status')).toContainText('Stroke converted');

 await load(page,'<text x="200" y="300" font-family="Arimo" font-size="80">BOO</text>');
 const text=page.locator('#text-content');
 await text.press('End');await text.press('Shift+T');
 await expect(text).toHaveValue('BOOT');expect((await state(page))[0][0]).toBe('PointText');
 await page.locator('#canvas').focus();await page.keyboard.press('Shift+T');
 await expect(page.locator('#status')).toContainText('Text converted');
 expect((await state(page))[0][0]).toBe('CompoundPath');
});
