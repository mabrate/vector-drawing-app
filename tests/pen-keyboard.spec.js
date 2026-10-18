import {test,expect} from '@playwright/test';
async function points(page,count){const r=await page.locator('#canvas').boundingBox();for(let i=0;i<count;i++)await page.mouse.click(r.x+120+i*90,r.y+150+(i%2)*80);}
async function drawing(page){return page.evaluate(()=>JSON.parse(localStorage.getItem('vector-lab'))[1].children||[]);}
test('pen undo removes one node at a time and allows drawing to continue',async({page})=>{
 await page.goto('/');await page.locator('[data-tool=pen]').click();await points(page,3);
 await expect(page.locator('#undo')).toBeEnabled();
 await page.keyboard.press('Control+z');let items=await drawing(page);expect(items).toHaveLength(1);expect(items[0][1].segments).toHaveLength(2);
 await expect(page.locator('#finish')).toBeVisible();
 await page.keyboard.press('Meta+z');items=await drawing(page);expect(items[0][1].segments).toHaveLength(1);
 await page.keyboard.press('Control+z');expect(await drawing(page)).toHaveLength(0);await expect(page.locator('#finish')).toBeHidden();
 await points(page,3);await page.keyboard.press('Enter');expect((await drawing(page))[0][1].segments).toHaveLength(3);
 await page.keyboard.press('Control+z');expect(await drawing(page)).toHaveLength(0);
});
test('Escape cancels pen drawing and clears object and node selection',async({page})=>{
 await page.goto('/');await page.locator('[data-tool=pen]').click();await points(page,3);await page.keyboard.press('Escape');
 expect(await drawing(page)).toHaveLength(0);await expect(page.locator('#finish')).toBeHidden();await expect(page.locator('#delete')).toBeDisabled();
 await points(page,3);await page.keyboard.press('Enter');await page.keyboard.press('Escape');expect(await drawing(page)).toHaveLength(1);await expect(page.locator('#delete')).toBeDisabled();
 await page.keyboard.press('n');await page.keyboard.press('Control+a');await expect(page.locator('#node-count')).toContainText('3 nodes');await page.keyboard.press('Escape');await expect(page.locator('#node-count')).toHaveText('0 nodes selected');await expect(page.locator('#delete')).toBeDisabled();
});
