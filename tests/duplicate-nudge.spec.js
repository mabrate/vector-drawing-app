import {test,expect} from '@playwright/test';
test.use({launchOptions:{executablePath:'/usr/bin/google-chrome'},viewport:{width:1280,height:800}});
for(const [unit,steps] of [['in',2],['mm',5],['px',20],['pt',15]])test(`duplicate can be nudged exactly back in ${unit}`,async({page})=>{
 await page.goto('/');await page.locator('#file-menu-button').click();await page.locator('#settings').click();await page.locator('#units').selectOption(unit);await page.locator('#settings-done').click();
 page.once('dialog',d=>d.accept());await page.locator('#file').setInputFiles({name:'box.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><path d="M100 100h100v100h-100z" fill="red"/></svg>')});
 await expect(page.locator('#status')).toContainText('SVG opened');await page.keyboard.press('Control+a');await page.locator('#dimensions-toggle').click();
 const x=Number(await page.locator('#position-x').inputValue()),y=Number(await page.locator('#position-y').inputValue());
 await page.locator('#duplicate').click();expect(Number(await page.locator('#position-x').inputValue())).toBeGreaterThan(x);
 for(let i=0;i<steps;i++){await page.keyboard.press('ArrowLeft');await page.keyboard.press('ArrowUp');}
 expect(Number(await page.locator('#position-x').inputValue())).toBeCloseTo(x,3);expect(Number(await page.locator('#position-y').inputValue())).toBeCloseTo(y,3);
});
