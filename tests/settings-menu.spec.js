import {test,expect} from '@playwright/test';
test.use({launchOptions:{executablePath:'/usr/bin/google-chrome'}});
for(const viewport of [{width:1280,height:800},{width:390,height:844},{width:640,height:480}])test(`file and settings at ${viewport.width}x${viewport.height}`,async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize(viewport);await page.goto('/');
 await expect(page.locator('#save')).toBeInViewport();
 await expect(page.locator('.context #units')).toHaveCount(0);
 await page.locator('#file-menu-button').click();
 for(const id of ['new','open','settings'])await expect(page.locator('#'+id)).toBeVisible();
 await page.locator('#settings').click();await expect(page.locator('#settings-dialog')).toBeVisible();
 await page.locator('#units').selectOption('mm');await expect(page.locator('#page-width')).toHaveValue('279.4');
 await page.locator('#page-width').fill('200');await page.locator('#page-width').press('Enter');
 await page.locator('#snapping').uncheck();await expect(page.locator('#snapping')).not.toBeChecked();
 await page.screenshot({path:`/tmp/settings-${viewport.width}.png`});
 await page.locator('#settings-done').click();await expect(page.locator('#settings-dialog')).not.toBeVisible();
 await page.locator('#file-menu-button').click();await page.locator('#settings').click();await expect(page.locator('#page-width')).toHaveValue('200');
 await page.keyboard.press('Escape');await expect(page.locator('#settings-dialog')).not.toBeVisible();
 await expect(page.locator('#file-menu-button')).toBeFocused();expect(errors).toEqual([]);
});
