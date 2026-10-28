import {test,expect} from '@playwright/test';
test.use({launchOptions:{executablePath:'/usr/bin/google-chrome'}});
// This precision check enters a radius in inches, independent of the app default.
test.beforeEach(async({page})=>{await page.addInitScript(()=>localStorage.setItem('vector-lab-unit','in'));});
for(const viewport of [{width:1280,height:800},{width:390,height:844}])test(`corner treatments in Align at ${viewport.width}`,async({page})=>{
 await page.setViewportSize(viewport);await page.goto('/');page.once('dialog',d=>d.accept());
 await page.locator('#file').setInputFiles({name:'corner.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><path d="M100 200L200 200L200 300" fill="none" stroke="black"/></svg>')});
 await expect(page.locator('#status')).toContainText('SVG opened');await page.keyboard.press('Control+a');
 if(!await page.locator('[data-tool=nodes]').isVisible())await page.locator('#mobile-tools').click();
 await page.locator('[data-tool=nodes]').click();await page.keyboard.press('Control+a');
 if(!await page.locator('[data-panel=align]').isVisible())await page.locator('#mobile-properties').click();
 await page.locator('[data-panel=align]').click();
 await expect(page.locator('.context #corner-controls')).toHaveCount(0);
 await page.locator('#corner-amount').fill('0.2');await page.locator('#apply-corner').click();
 const effect=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('vector-lab'))[1].children[0][1].data.cornerEffect);
 expect((await effect()).effects[1].amount).toBeCloseTo(19.2);
 await page.locator('#corner-type').selectOption('chamfer');expect((await effect()).effects[1].type).toBe('chamfer');
 await page.locator('#reset-corner').click();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('vector-lab'))[1].children[0][1].segments)).toEqual([[100,200],[200,200],[200,300]]);
 await page.locator('#corner-controls').scrollIntoViewIfNeeded();await page.screenshot({path:`/tmp/corner-panel-${viewport.width}.png`});
 if(await page.locator('.mobile-menu-close').first().isVisible())await page.locator('.properties .mobile-menu-close').click();
 await page.keyboard.press('s');
 await expect(page.locator('#corner-controls')).toHaveJSProperty('hidden',true);
 await page.keyboard.press('n');await expect(page.locator('#corner-controls')).toHaveJSProperty('hidden',false);
});
