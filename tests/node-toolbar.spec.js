import {test,expect} from '@playwright/test';
test.use({launchOptions:{executablePath:'/usr/bin/google-chrome'}});
for(const width of [1280,820])test(`Nodes mode keeps multiple-object selection while hiding stacking and ruler controls (${width})`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.goto('/');
 const stack=page.locator('.stack-controls'),multi=page.locator('.multi-toggle'),ruler=page.locator('#dimensions-tool');
 await expect(stack).toBeVisible();await expect(multi).toBeVisible();await expect(ruler).toBeVisible();await page.locator('#multi').check();await page.locator('#dimensions-toggle').click();
 await page.keyboard.press('n');await expect(stack).toBeHidden();await expect(multi).toBeVisible();await expect(ruler).toBeHidden();await expect(page.locator('#multi-nodes')).toHaveCount(0);await expect(page.locator('#node-round')).toBeVisible();
 await page.keyboard.press('s');await expect(stack).toBeVisible();await expect(multi).toBeVisible();await expect(ruler).toBeVisible();await expect(page.locator('#multi')).toBeChecked();await expect(page.locator('#dimensions-toggle')).toHaveAttribute('aria-pressed','true');
});
test('the shared multiple-selection icon adds paths in Nodes mode',async({page})=>{
 await page.goto('/');page.once('dialog',d=>d.accept());await page.locator('#file').setInputFiles({name:'paths.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><path d="M300 300h200v100H300z" fill="orange"/><path d="M600 300h200v100H600z" fill="blue"/></svg>')});await expect(page.locator('#status')).toContainText('SVG opened');await page.keyboard.press('n');await page.locator('#multi').check();await expect(page.locator('#multi-nodes')).toHaveCount(0);
 for(const x of [400,700]){const p=await page.locator('#canvas').evaluate(async(c,x)=>{const {default:paper}=await import(performance.getEntriesByType('resource').find(e=>e.name.includes('/deps/paper.js')).name),p=paper.view.projectToView(new paper.Point(x,300)),r=c.getBoundingClientRect();return{x:p.x+r.x,y:p.y+r.y};},x);await page.mouse.click(p.x,p.y);}
 await page.keyboard.press('Control+a');await expect(page.locator('#node-count')).toHaveText('8 nodes selected');await page.locator('#multi').uncheck();
 const p=await page.locator('#canvas').evaluate(async c=>{const {default:paper}=await import(performance.getEntriesByType('resource').find(e=>e.name.includes('/deps/paper.js')).name),p=paper.view.projectToView(new paper.Point(400,300)),r=c.getBoundingClientRect();return{x:p.x+r.x,y:p.y+r.y};});await page.mouse.click(p.x,p.y);await page.keyboard.press('Control+a');await expect(page.locator('#node-count')).toHaveText('4 nodes selected');
});
for(const touch of [false,true])test(`one multiple-selection icon adds nodes across paths and stays active across tools (touch=${touch})`,async({browser})=>{
 const context=await browser.newContext({hasTouch:touch,viewport:{width:1280,height:900}}),page=await context.newPage();try{
 await page.goto('/');page.once('dialog',d=>d.accept());await page.locator('#file').setInputFiles({name:'shared.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><path d="M300 300h200v100H300z" fill="orange"/><path d="M600 300h200v100H600z" fill="blue"/></svg>')});await expect(page.locator('#status')).toContainText('SVG opened');
 await page.locator('#multi').check();await page.locator('[data-tool=nodes]').click();
 async function click(x,y){const p=await page.locator('#canvas').evaluate(async(c,{x,y})=>{const {default:paper}=await import(performance.getEntriesByType('resource').find(e=>e.name.includes('/deps/paper.js')).name),p=paper.view.projectToView(new paper.Point(x,y)),r=c.getBoundingClientRect();return{x:p.x+r.x,y:p.y+r.y};},{x,y});if(touch)await page.touchscreen.tap(p.x,p.y);else await page.mouse.click(p.x,p.y);}
 await click(300,300);await expect(page.locator('#node-count')).toHaveText('1 node selected');await click(600,300);await expect(page.locator('#node-count')).toHaveText('2 nodes selected');await click(800,400);await expect(page.locator('#node-count')).toHaveText('3 nodes selected');
 // Adding a path by its outline keeps the existing node selection as well.
 await click(400,300);await expect(page.locator('#node-count')).toHaveText('3 nodes selected');
 await page.keyboard.press('s');await expect(page.locator('#multi')).toBeChecked();await page.keyboard.press('n');await expect(page.locator('#multi')).toBeChecked();await page.locator('#multi').uncheck();await click(300,300);await click(500,400);await expect(page.locator('#node-count')).toHaveText('1 node selected');
 }finally{await context.close();}
});
