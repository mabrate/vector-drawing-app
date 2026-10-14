import {test,expect} from '@playwright/test';
for(const size of [{width:1100,height:400},{width:1024,height:520},{width:800,height:520},{width:640,height:480}])test(`toolbars stay reachable in a constrained ${size.width}x${size.height} viewport`,async({page})=>{
  await page.setViewportSize(size);await page.goto('/');
  await expect(page.locator('#canvas')).toBeVisible();
  const bounds=await page.locator('footer').boundingBox();expect(bounds.y+bounds.height).toBeLessThanOrEqual(size.height);
  expect(await page.evaluate(()=>document.documentElement.scrollHeight)).toBeLessThanOrEqual(size.height);
  const canvas=await page.locator('#canvas').boundingBox();expect(canvas.height).toBeGreaterThan(150);
  const tools=page.locator('#drawing-tools');if(!await tools.isVisible())await page.locator('#mobile-tools').click();
  await expect(page.locator('[data-tool=rectangle]')).toBeInViewport();await page.locator('[data-tool=rectangle]').click();
  await page.locator('#zoom-in').click();await expect(page.locator('#zoom-out')).toBeInViewport();
  await page.screenshot({path:`/tmp/vector-lab-layout-${size.width}x${size.height}.png`});
});
