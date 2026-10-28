import {test,expect} from '@playwright/test';
test.use({viewport:{width:390,height:844},hasTouch:true,launchOptions:{executablePath:'/usr/bin/google-chrome'}});
test('touch drag preserves all selected shapes; tap still removes one',async({page})=>{
  await page.goto('/');
  page.once('dialog',d=>d.accept());
  await page.locator('#file').setInputFiles({name:'three.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><path d="M100 300h100v100h-100z"/><path d="M400 300h100v100h-100z"/><path d="M700 300h100v100h-100z"/></svg>')});
  await expect(page.locator('#status')).toContainText('SVG opened');
  await page.locator('#file-menu-button').click();await page.locator('#settings').click();
  await page.locator('#snapping').uncheck();
  await page.locator('#settings-done').click();
  const point=async(x,y)=>page.locator('#canvas').evaluate((c,{x,y})=>{const r=c.getBoundingClientRect(),z=Math.min((r.width-50)/1056,(r.height-50)/816);return{x:r.x+r.width/2+(x-528)*z,y:r.y+r.height/2+(y-408)*z};},{x,y});
  const cdp=await page.context().newCDPSession(page);
  const touch=async(type,p)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:p?[p]:[]});
  await touch('touchStart',await point(150,350));await touch('touchEnd');
  await page.locator('#multi').check();
  for(const x of [450,750]){await touch('touchStart',await point(x,350));await touch('touchEnd');}
  const positions=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('vector-lab'))[1].children.map(i=>{const s=i[1].segments[0];return Array.isArray(s[0])?s[0]:s;}));
  const before=await positions();
  await touch('touchStart',await point(450,350));
  await touch('touchMove',await point(500,400));
  await touch('touchEnd');
  const after=await positions();
  for(let i=0;i<3;i++){expect(after[i][0]-before[i][0]).toBeCloseTo(50,0);expect(after[i][1]-before[i][1]).toBeCloseTo(50,0);}
  // A tap removes the middle shape; the next drag moves only the other two.
  await touch('touchStart',await point(500,400));await touch('touchEnd');
  await touch('touchStart',await point(200,400));await touch('touchMove',await point(250,450));await touch('touchEnd');
  const final=await positions();
  expect(final[1]).toEqual(after[1]);
  for(const i of [0,2])expect(final[i][0]-after[i][0]).toBeCloseTo(50,0);
});
