import {test,expect} from '@playwright/test';
test.use({launchOptions:{executablePath:'/usr/bin/google-chrome'}});
const drawing='<svg xmlns="http://www.w3.org/2000/svg" width="1056" height="816"><path d="M200 200H700V600H200Z" fill="blue"/><path d="M300 300H500V500H300Z" fill="red"/><path d="M550 300H620V370H550Z" fill="green"/></svg>';
async function point(page,x,y){return page.locator('#canvas').evaluate(async(c,{x,y})=>{const {default:paper}=await import(performance.getEntriesByType('resource').find(e=>e.name.includes('/deps/paper.js')).name),p=paper.view.projectToView(new paper.Point(x,y)),r=c.getBoundingClientRect();return{x:r.x+p.x,y:r.y+p.y};},{x,y});}
async function click(page,x,y){const p=await point(page,x,y);await page.mouse.click(p.x,p.y);}
async function box(page,from,to){const a=await point(page,...from),b=await point(page,...to);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:5});}
const saved=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('vector-lab'))[1].children);
const x=item=>item[1].segments[0][0];
test.beforeEach(async({page})=>{
 await page.goto('/');page.once('dialog',d=>d.accept());await page.locator('#file').setInputFiles({name:'overlap.svg',mimeType:'image/svg+xml',buffer:Buffer.from(drawing)});await expect(page.locator('#status')).toContainText('SVG opened');
 await page.locator('#file-menu-button').click();await page.locator('#settings').click();await page.locator('#snapping').uncheck();await page.locator('#settings-done').click();await click(page,400,400);
});

for(const from of [[250,250],[200,250]])for(const multi of [false,true])test(`Shift-drag starts a selection box on a shape ${from[0]===200?'edge':'fill'} (multi ${multi})`,async({page})=>{
 await page.locator('#multi').setChecked(multi);const before=await saved(page);
 await page.keyboard.down('Shift');await box(page,from,[650,450]);await expect(page.locator('#group-objects')).toBeVisible();await page.mouse.up();await page.keyboard.up('Shift');expect(await saved(page)).toEqual(before);
 await page.keyboard.press('ArrowRight');const after=await saved(page);expect(after[0]).toEqual(before[0]);expect(x(after[1])).toBeGreaterThan(x(before[1]));expect(x(after[2])).toBeGreaterThan(x(before[2]));
});

test('Shift box can start over artwork with no prior selection and only selects fully enclosed shapes',async({page})=>{
 await click(page,900,700);const before=await saved(page);await page.keyboard.down('Shift');await box(page,[250,250],[650,450]);await page.mouse.up();await page.keyboard.up('Shift');expect(await saved(page)).toEqual(before);
 await page.keyboard.press('ArrowRight');const after=await saved(page);expect(after.slice(0,2)).toEqual(before.slice(0,2));expect(x(after[2])).toBeGreaterThan(x(before[2]));
});

test('Shift-click still adds and removes objects while a Shift-click on empty space preserves selection',async({page})=>{
 await page.keyboard.down('Shift');await click(page,585,335);await expect(page.locator('#group-objects')).toBeVisible();await click(page,585,335);await expect(page.locator('#group-objects')).toBeHidden();await click(page,900,700);await page.keyboard.up('Shift');
 const before=await saved(page);await page.keyboard.press('ArrowRight');const after=await saved(page);expect(after[0]).toEqual(before[0]);expect(x(after[1])).toBeGreaterThan(x(before[1]));expect(after[2]).toEqual(before[2]);
});

test('cancelling a Shift box restores the previous selection and leaves objects in place',async({page})=>{
 const before=await saved(page);await page.keyboard.down('Shift');await box(page,[250,250],[650,450]);await expect(page.locator('#group-objects')).toBeVisible();await page.locator('#canvas').evaluate(c=>c.releasePointerCapture(1));await page.mouse.up();await page.keyboard.up('Shift');expect(await saved(page)).toEqual(before);
 await page.keyboard.press('ArrowRight');const after=await saved(page);expect(after[0]).toEqual(before[0]);expect(x(after[1])).toBeGreaterThan(x(before[1]));expect(after[2]).toEqual(before[2]);
});

test('Shift on an actual resize handle still resizes around the center',async({page})=>{
 await page.keyboard.down('Shift');await box(page,[500,500],[550,550]);await page.mouse.up();await page.keyboard.up('Shift');
 const bounds=await page.evaluate(async()=>{const {default:paper}=await import(performance.getEntriesByType('resource').find(e=>e.name.includes('/deps/paper.js')).name),b=paper.project.layers[1].children[1].bounds;return [b.x,b.y,b.width,b.height];});
 for(let i=0;i<4;i++)expect(bounds[i]).toBeCloseTo([250,250,300,300][i],4);
});
