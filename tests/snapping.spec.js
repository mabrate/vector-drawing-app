import {expect,test} from '@playwright/test';

async function load(page, artwork) {
  await page.goto('/');
  await expect(page.locator('#browser-recovery')).toHaveAttribute('data-state','saved');
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#file').setInputFiles({name:'snapping.svg',mimeType:'image/svg+xml',buffer:Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1056" height="816">${artwork}</svg>`
  )});
  await expect(page.locator('#status')).toContainText('SVG opened');
}

async function screenPoint(page,x,y) {
  return page.evaluate(async ([x,y])=>{
    const url = performance.getEntriesByType('resource').find(entry=>entry.name.includes('/deps/paper.js')).name;
    const {default:paper} = await import(url);
    const p = paper.view.projectToView(new paper.Point(x,y));
    const rect = document.getElementById('canvas').getBoundingClientRect();
    return {x:rect.left+p.x,y:rect.top+p.y};
  },[x,y]);
}

async function move(page,x,y) {
  const point = await screenPoint(page,x,y);
  await page.mouse.move(point.x,point.y);
}

async function state(page) {
  return page.evaluate(async ()=>{
    await new Promise(requestAnimationFrame);
    const url = performance.getEntriesByType('resource').find(entry=>entry.name.includes('/deps/paper.js')).name;
    const {default:paper} = await import(url);
    const [ ,art,overlay,penOverlay] = paper.project.layers;
    const xy = p=>[p.x,p.y];
    const pen = penOverlay.getItem({name:'pen-preview'});
    return {
      paths:art.children.map(path=>path.segments.map(segment=>xy(path.localToGlobal(segment.point)))),
      bounds:art.children.map(({bounds:r})=>({left:r.left,right:r.right,top:r.top})),
      contacts:[...overlay.children,...penOverlay.children].filter(item=>item.data.snapContact).map(item=>xy(item.bounds.center)),
      preview:pen?xy(pen.lastSegment.point):null
    };
  });
}

test('facing rectangle sides snap flush even when a center is closer to the edge',async({page})=>{
  await load(page,'<path fill="orange" d="M360 220h160v100H360z"/><path fill="blue" d="M150 220h16v40h-16z"/>');
  await move(page,158,240);
  await page.mouse.down();
  await move(page,360,243);
  const touching = (await state(page)).bounds;
  expect(touching[1].right).toBeCloseTo(touching[0].left,6);
  expect(touching[1].top).toBeCloseTo(touching[0].top,6);
  await move(page,320,243);
  await page.mouse.up();
  expect((await state(page)).bounds[1].right).toBeCloseTo(328,2);
});

test('facing sides on distant rows do not create a contact snap',async({page})=>{
  await load(page,'<path fill="orange" d="M360 160h160v100H360z"/><path fill="blue" d="M120 390h100v60H120z"/>');
  await move(page,170,420);
  await page.mouse.down();
  await move(page,306,420);
  await page.mouse.up();
  expect((await state(page)).bounds[1].right).toBeCloseTo(356,2);
});

test('an unrelated alignment guide cannot pull touching sides apart',async({page})=>{
  await load(page,'<path d="M360 245h160v100H360z"/><path d="M620 197h80v100H620z"/><path d="M120 193h100v45H120z"/>');
  await page.locator('#file-menu-button').click();
  await page.locator('#settings').click();
  await page.locator('#snap-nodes').uncheck();
  await page.locator('#settings-done').click();
  await move(page,170,215);
  await page.mouse.down();
  await move(page,306,225);
  await page.mouse.up();
  const moved = (await state(page)).bounds[2];
  expect(moved.right).toBeCloseTo(360,6);
  expect(moved.top).toBeCloseTo(203,2);
});

test('a shape can still snap to the midpoint of a gap',async({page})=>{
  await load(page,'<path d="M160 220h90v100h-90z"/><path d="M490 220h90v100h-90z"/><path d="M70 225h60v60H70z"/>');
  await move(page,100,255);
  await page.mouse.down();
  await move(page,376,255);
  expect((await state(page)).bounds[2].left).toBeCloseTo(340,6);
  await expect(page.locator('#status')).toHaveText('Equal spacing');
  await page.mouse.up();
});

test('a node grabbed off-center lands on a side and corner, then releases away from the path',async({page})=>{
  await load(page,'<path fill="orange" d="M350 210h190v160H350z"/><path fill="blue" d="M135 170l60 -10 -15 50z"/>');
  await page.locator('[data-tool=nodes]').click();
  await move(page,139,173);
  await page.mouse.down();
  await move(page,359,288);
  const side = await state(page);
  expect(side.paths[1][0][0]).toBeCloseTo(350,6);
  expect(side.paths[1][0][1]).toBeCloseTo(285,2);
  expect(side.contacts).toEqual([side.paths[1][0]]);
  await move(page,358,218);
  const corner = await state(page);
  expect(corner.paths[1][0]).toEqual([350,210]);
  await move(page,358,443);
  await page.mouse.up();
  const free = await state(page);
  expect(free.paths[1][0][0]).toBeCloseTo(354,2);
  expect(free.paths[1][0][1]).toBeCloseTo(440,2);
  expect(free.contacts).toHaveLength(0);
});

test('Pen previews an existing anchor before the first click and lands on a curve with Ctrl held',async({page})=>{
  await load(page,'<path d="M150 210L250 170" stroke="black"/><path d="M390 250Q440 150 490 250" fill="none" stroke="black"/>');
  const original = (await state(page)).paths;
  await page.locator('[data-tool=pen]').click();
  await move(page,154,215);
  await expect.poll(async()=>(await state(page)).contacts).toEqual([[150,210]]);
  expect((await state(page)).paths).toEqual(original);
  await page.mouse.down();await page.mouse.up();
  await page.keyboard.down('Control');
  await move(page,421,205);
  const hover = await state(page);
  expect(hover.preview[0]).toBeCloseTo(440-Math.sqrt(500),6);
  expect(hover.preview[1]).toBeCloseTo(210,6);
  expect(hover.contacts).toEqual([hover.preview]);
  await page.mouse.down();await page.mouse.up();
  await page.keyboard.up('Control');
  await page.keyboard.press('Enter');
  const finished = await state(page);
  expect(finished.paths.slice(0,2)).toEqual(original);
  expect(finished.paths[2]).toEqual([[150,210],hover.preview]);
  expect(finished.preview).toBeNull();
});

test.describe('Pen with touch input',()=>{
  test.use({hasTouch:true});

  test('taps snap to an existing corner and side without hover',async({page})=>{
    await load(page,'<path d="M350 210h190v160H350z"/>');
    await page.locator('[data-tool=pen]').tap();
    for(const [x,y] of [[344,205],[344,285]]){
      const p = await screenPoint(page,x,y);
      await page.touchscreen.tap(p.x,p.y);
    }
    await page.keyboard.press('Enter');
    const [,pen] = (await state(page)).paths;
    expect(pen[0]).toEqual([350,210]);
    expect(pen[1][0]).toBeCloseTo(350,6);
    expect(Math.abs(pen[1][1]-285)).toBeLessThan(1.5);
  });
});
