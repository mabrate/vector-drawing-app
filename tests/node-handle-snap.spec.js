import {test,expect} from '@playwright/test';
test.use({launchOptions:{executablePath:'/usr/bin/google-chrome'}});
for(const modifier of ['Control','Meta'])test(`${modifier} snaps node handles to 15 degrees and preserves linked length`,async({page})=>{
  await page.goto('/');page.once('dialog',d=>d.accept());
  await page.locator('#file').setInputFiles({name:'curve.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><path d="M100 300C180 300 240 300 300 300C360 300 420 300 500 300" fill="none" stroke="black"/></svg>')});
  await expect(page.locator('#status')).toContainText('SVG opened');
  await page.keyboard.press('Control+a');await page.locator('[data-tool=nodes]').click();
  const point=async(x,y)=>page.locator('#canvas').evaluate((c,{x,y})=>{const r=c.getBoundingClientRect(),z=Math.min((r.width-50)/1056,(r.height-50)/816);return{x:r.x+r.width/2+(x-528)*z,y:r.y+r.height/2+(y-408)*z};},{x,y});
  const state=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('vector-lab'))[1].children[0][1].segments);
  const anchor=await point(300,300);await page.mouse.click(anchor.x,anchor.y);await page.locator('#node-round').click();
  const before=await state();
  const from=await point(360,300),to=await point(380,335);
  await page.mouse.move(from.x,from.y);await page.mouse.down();await page.keyboard.down(modifier);await page.mouse.move(to.x,to.y,{steps:5});await page.mouse.up();await page.keyboard.up(modifier);
  const s=(await state())[1],angle=Math.atan2(s[2][1],s[2][0])*180/Math.PI;
  expect(angle).toBeCloseTo(30,5);
  expect(Math.hypot(...s[2])).toBeCloseTo(Math.hypot(80,35),0);
  expect(Math.hypot(...s[1])).toBeCloseTo(Math.hypot(...before[1][1]),5);
  expect((s[1][0]*s[2][1]-s[1][1]*s[2][0])/(Math.hypot(...s[1])*Math.hypot(...s[2]))).toBeCloseTo(0,6);
  await page.locator('#canvas-undo').click();expect(await state()).toEqual(before);
  // Releasing the modifier restores free angles on the next drag.
  await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:5});await page.mouse.up();
  const free=(await state())[1][2];expect(Math.atan2(free[1],free[0])*180/Math.PI).toBeCloseTo(Math.atan2(35,80)*180/Math.PI,0);
});
