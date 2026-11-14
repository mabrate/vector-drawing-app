import {test,expect} from '@playwright/test';
import {stored,snapshot,idle,open,choose,pathButton,applyTool,addBox,center} from './model3d-helpers.js';
test.use({launchOptions:{executablePath:'/usr/bin/google-chrome',args:['--enable-unsafe-swiftshader']},hasTouch:true});
test.setTimeout(120000);

test('visibility controls exclude hidden geometry from picking and keep it in the saved model and exports',async({page})=>{
  await open(page);await addBox(page);const summary=await page.locator('#model3d-summary').textContent();
  await page.locator('[data-model-view=top]').click();let p=await center(page);await page.mouse.click(p.x,p.y);await expect(page.locator('#model3d-bodies [data-object-pick]')).toHaveAttribute('aria-pressed','true');
  await page.locator('#model3d-bodies button[aria-label^="Hide "]').click();await expect(page.locator('#model3d-bodies [data-object-pick]')).toBeDisabled();await page.mouse.click(p.x,p.y);await expect(page.locator('#model3d-bodies [data-object-pick]')).toHaveAttribute('aria-pressed','false');await expect(page.locator('#model3d-summary')).toHaveText(summary);
  const event=page.waitForEvent('download');await page.locator('#model3d-stl').click();const download=await event;expect((await (await import('node:fs/promises')).stat(await download.path())).size).toBeGreaterThan(100);await idle(page);
  await page.locator('#model3d-bodies button[aria-label^="Show "]').click();await choose(page,'extrude');
  // The source remains pickable on Z=0 underneath the solid.
  p=await center(page);await page.mouse.click(p.x,p.y);await expect(pathButton(page)).toHaveAttribute('aria-pressed','false');await page.touchscreen.tap(p.x,p.y);await expect(pathButton(page)).toHaveAttribute('aria-pressed','true');
  await page.locator('#model3d-paths button[aria-label^="Hide "]').click();await expect(pathButton(page)).toBeDisabled();await page.mouse.click(p.x,p.y);await expect(page.locator('#model3d-preview')).toBeDisabled();
  await page.locator('#model3d-paths button[aria-label^="Show "]').click();await pathButton(page).click();await expect(page.locator('#model3d-preview')).toBeEnabled();await page.locator('#model3d-cancel-tool').click();await idle(page);await page.locator('#model3d-apply').click();expect((await stored(page)).features).toHaveLength(1);
});

test('all drawing paths are available, grouped compounds preserve holes, and invalid paths explain their constraint',async({page})=>{
  await open(page,'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120"><g><path id="Ring" fill-rule="evenodd" d="M0 0H80V80H0Z M20 20H60V60H20Z" fill="teal"/><path id="Square" d="M100 0h50v50h-50z" fill="orange"/><path id="Open" d="M0 100H150" fill="none" stroke="black"/></g></svg>');
  await expect(page.locator('#model3d-paths [data-object-pick]')).toHaveCount(3);await expect(pathButton(page,2)).toBeDisabled();await expect(pathButton(page,2)).toHaveAttribute('title',/Close every/);
  await choose(page,'extrude');await pathButton(page,0).click();await pathButton(page,1).click();await applyTool(page);await expect(page.locator('#model3d-summary')).toContainText('1 solid group');await page.locator('#model3d-apply').click();expect((await stored(page)).features[0].profile).toHaveLength(2);expect((await stored(page)).features[0].profile[0].holes).toHaveLength(1);
});

test('mobile and desktop show only the active tool and fit both object lists and settings',async({page})=>{
  await open(page);const before=await snapshot(page);await addBox(page);await choose(page,'shell');
  await expect(page.locator('#model3d-edges')).toBeHidden();await expect(page.locator('#model3d-extrusion')).toBeHidden();
  expect(await page.locator('.model3d-controls').evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);expect((await pathButton(page).boundingBox()).width).toBeGreaterThan(80);await expect(page.locator('#model3d-apply')).toBeInViewport();await page.screenshot({path:'/tmp/vector-lab-3d-workspace-desktop.png'});
  await page.setViewportSize({width:390,height:844});await page.locator('#model3d-shell').scrollIntoViewIfNeeded();expect(await page.locator('#model3d-dialog').evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);await expect(page.locator('#model3d-apply')).toBeInViewport();await page.screenshot({path:'/tmp/vector-lab-3d-workspace-mobile.png'});
  await choose(page,'fillet');await expect(page.locator('#model3d-shell')).toBeHidden();await expect(page.locator('#model3d-edges')).toBeVisible();await page.locator('#model3d-cancel').click();expect(await snapshot(page)).toBe(before);
});
