import {test,expect} from '@playwright/test';
import {pathAction,openPathMenu} from './helpers/path-actions.js';
test.use({launchOptions:{executablePath:'/usr/bin/google-chrome'}});
async function load(page,content){page.once('dialog',d=>d.accept());await page.locator('#file').setInputFiles({name:'paths.svg',mimeType:'image/svg+xml',buffer:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1056" height="816">${content}</svg>`)});await expect(page.locator('#status')).toContainText('SVG opened');await page.keyboard.press('Control+a');}
for(const viewport of [{width:1280,height:800},{width:390,height:844},{width:640,height:480}])test(`Path menu is accessible and stays inside the screen at ${viewport.width}`,async({page})=>{
 await page.setViewportSize(viewport);await page.goto('/');await openPathMenu(page);
 await expect(page.locator('#path-menu button')).toHaveCount(5);
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
 await page.goto('/');await load(page,'<path d="M200 200h150v100H200z" fill="red"/><path d="M280 240h150v100H280z" fill="blue"/>');
 await pathAction(page,`[data-boolean=${operation}]`);
 const state=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('vector-lab'))[1].children);
 expect(await state()).toHaveLength(1);expect((await state())[0][1].data.shapeBuild.operation).toBe(operation);
 await page.locator('#canvas-undo').click();expect(await state()).toHaveLength(2);await page.locator('#canvas-redo').click();expect(await state()).toHaveLength(1);
});
