import {test,expect} from '@playwright/test';
test.use({launchOptions:{executablePath:'/usr/bin/google-chrome'}});
test('node alignment uses selected anchors and supports distribution and undo',async({page})=>{
 await page.goto('/');page.once('dialog',d=>d.accept());
 await page.locator('#file').setInputFiles({name:'nodes.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><path d="M100 100L200 250L500 400" fill="none" stroke="black"/></svg>')});
 await expect(page.locator('#status')).toContainText('SVG opened');await page.keyboard.press('Control+a');await page.locator('[data-panel=align]').click();
 await page.locator('[data-tool=nodes]').click();await expect(page.locator('#node-alignment')).toBeVisible();await expect(page.locator('#object-alignment')).toBeHidden();await expect(page.locator('[data-node-align=x]')).toBeDisabled();
 await page.keyboard.press('Control+a');
 const points=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('vector-lab'))[1].children[0][1].segments);
 const before=await points();
 await page.locator('#node-align-reference').selectOption('last');await page.locator('[data-node-align=y]').click();expect(await points()).toEqual([[100,400],[200,400],[500,400]]);
 await page.locator('[data-node-distribute=x]').click();expect(await points()).toEqual([[100,400],[300,400],[500,400]]);
 await page.locator('#canvas-undo').click();expect(await points()).toEqual([[100,400],[200,400],[500,400]]);
 await page.locator('#canvas-undo').click();expect(await points()).toEqual(before);
 await page.locator('[data-tool=select]').click();await expect(page.locator('#object-alignment')).toBeVisible();await expect(page.locator('#node-alignment')).toBeHidden();
});
