import {test,expect} from '@playwright/test';
test.use({launchOptions:{executablePath:'/usr/bin/google-chrome'}});
const drawing='<svg xmlns="http://www.w3.org/2000/svg" width="1056" height="816"><path d="M200 200H700V600H200Z" fill="blue"/><path d="M300 300H500V500H300Z" fill="red"/></svg>';
async function point(page,x,y){return page.locator('#canvas').evaluate(async(c,{x,y})=>{const {default:paper}=await import(performance.getEntriesByType('resource').find(e=>e.name.includes('/deps/paper.js')).name),p=paper.view.projectToView(new paper.Point(x,y)),r=c.getBoundingClientRect();return {x:r.x+p.x,y:r.y+p.y};},{x,y});}
async function click(page,x,y){const p=await point(page,x,y);await page.mouse.click(p.x,p.y);}
async function box(page,from,to){const a=await point(page,...from),b=await point(page,...to);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:5});}
const saved=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('vector-lab'))[1].children);
test.beforeEach(async({page})=>{
 await page.goto('/');page.once('dialog',d=>d.accept());await page.locator('#file').setInputFiles({name:'overlap.svg',mimeType:'image/svg+xml',buffer:Buffer.from(drawing)});await expect(page.locator('#status')).toContainText('SVG opened');
 await page.locator('#file-menu-button').click();await page.locator('#settings').click();await page.locator('#snapping').uncheck();await page.locator('#settings-done').click();
 await click(page,400,400);await page.locator('[data-tool=nodes]').click();
});

for(const start of [[250,250],[200,250]])for(const multi of [false,true])test(`Shift-drag over the lower path ${start[0]===200?'edge':'fill'} keeps only the upper path selected (multi ${multi})`,async({page})=>{
 await page.locator('#multi').setChecked(multi);const before=await saved(page);
 await page.keyboard.down('Shift');await box(page,start,[400,400]);await expect(page.locator('#node-count')).toHaveText('1 node selected');await page.mouse.up();await page.keyboard.up('Shift');await expect(page.locator('#node-count')).toHaveText('1 node selected');
 await page.keyboard.press('ArrowRight');const after=await saved(page);expect(after[0]).toEqual(before[0]);expect(after[1][1].segments[0][0]).toBeGreaterThan(before[1][1].segments[0][0]);expect(after[1][1].segments.slice(1)).toEqual(before[1][1].segments.slice(1));
 await page.keyboard.press('Control+a');await expect(page.locator('#node-count')).toHaveText('4 nodes selected');
});

test('Shift box selection adds nodes and Shift-click on another path preserves the selection',async({page})=>{
 await click(page,500,300);await expect(page.locator('#node-count')).toHaveText('1 node selected');await page.keyboard.down('Shift');await box(page,[250,250],[400,400]);await page.mouse.up();await expect(page.locator('#node-count')).toHaveText('2 nodes selected');
 await click(page,650,450);await page.keyboard.up('Shift');await expect(page.locator('#node-count')).toHaveText('2 nodes selected');await page.keyboard.press('Control+a');await expect(page.locator('#node-count')).toHaveText('4 nodes selected');
});

test('Shift-click still adds and toggles anchors on the selected path',async({page})=>{
 await click(page,300,300);await page.keyboard.down('Shift');await click(page,500,300);await expect(page.locator('#node-count')).toHaveText('2 nodes selected');await click(page,500,300);await page.keyboard.up('Shift');await expect(page.locator('#node-count')).toHaveText('1 node selected');
});

test('Select multiple without Shift still adds paths',async({page})=>{
 await page.locator('#multi').check();await click(page,250,250);await page.keyboard.press('Control+a');await expect(page.locator('#node-count')).toHaveText('8 nodes selected');
});

test('cancelling a Shift box restores prior nodes and keeps path selection fixed',async({page})=>{
 await click(page,500,300);const before=await saved(page);await page.keyboard.down('Shift');await box(page,[250,250],[400,400]);await expect(page.locator('#node-count')).toHaveText('2 nodes selected');await page.locator('#canvas').evaluate(c=>c.releasePointerCapture(1));await page.mouse.up();await page.keyboard.up('Shift');await expect(page.locator('#node-count')).toHaveText('1 node selected');expect(await saved(page)).toEqual(before);
 await page.keyboard.press('Control+a');await expect(page.locator('#node-count')).toHaveText('4 nodes selected');
});
