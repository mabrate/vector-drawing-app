import {test,expect} from '@playwright/test';
test.use({launchOptions:{executablePath:'/usr/bin/google-chrome'}});

const saved=page=>page.evaluate(()=>({drawing:localStorage.getItem('vector-lab'),name:localStorage.getItem('vector-lab-name')}));
const state=(page,mode)=>expect(page.locator('#browser-recovery')).toHaveAttribute('data-state',mode);
async function openDrawing(page,color){
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#file').setInputFiles({name:`${color}.svg`,mimeType:'image/svg+xml',buffer:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><path fill="${color}" d="M100 100h100v100H100z"/></svg>`)});
  await expect(page.locator('#status')).toContainText('SVG opened');
}
async function exportSVG(page){
  await page.locator('#save').click();
  const downloading=page.waitForEvent('download');
  await page.locator('#download-svg').click();
  const download=await downloading;
  return {name:download.suggestedFilename(),text:Buffer.concat(await(await download.createReadStream()).toArray()).toString()};
}
async function takeOver(page,accept=true){
  page.once('dialog',dialog=>{
    expect(dialog.message()).toContain('replaces the existing recovery copy');
    return accept?dialog.accept():dialog.dismiss();
  });
  await page.locator('#take-over-recovery').click();
}

test('second tab can edit, undo, create, and download SVG without changing recovery or its filename',async({page,context})=>{
  await page.goto('/');await state(page,'saved');await openDrawing(page,'red');await state(page,'saved');
  const original=await saved(page),second=await context.newPage();
  await second.goto('/');await state(second,'paused');
  await expect(second.locator('#recovery-status')).toContainText('another tab');
  await openDrawing(second,'blue');
  await expect(second.locator('#recovery-status')).toContainText('Changes aren’t saved');
  await second.locator('#undo').click();await second.locator('#redo').click();
  expect(await saved(second)).toEqual(original);
  const svg=await exportSVG(second);expect(svg.name).toBe('blue.svg');expect(svg.text).toContain('#0000ff');
  expect(await saved(page)).toEqual(original);
  await second.locator('#file-menu-button').click();
  second.once('dialog',d=>d.accept());await second.locator('#new').click();
  expect(await saved(page)).toEqual(original);await state(second,'paused');
  // Tips and temporary action feedback cannot hide the recovery warning.
  await second.clock.install();await second.clock.fastForward(13000);
  await expect(second.locator('#recovery-status')).toContainText('Changes aren’t saved');
  await second.setViewportSize({width:390,height:844});
  await expect(second.locator('#recovery-status')).toBeInViewport();
  await expect(second.locator('#take-over-recovery')).toBeInViewport();
  expect(await second.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await second.screenshot({path:'/tmp/vector-lab-recovery-paused-phone.png'});
});

test('confirmed transfer saves this tab and immediately stops the previous owner, including undo and filename writes',async({page,context})=>{
  await page.goto('/');await state(page,'saved');await openDrawing(page,'red');await state(page,'saved');
  const second=await context.newPage();await second.goto('/');await state(second,'paused');await openDrawing(second,'blue');
  const original=await saved(page);await takeOver(second,false);expect(await saved(page)).toEqual(original);
  await takeOver(second);await state(second,'saved');await state(page,'paused');
  const blue=await saved(second);expect(blue.name).toBe('blue');expect(blue.drawing).toContain('[0,0,1]');
  // The original tab retains its red artwork even after the transfer.
  const red=await exportSVG(page);expect(red.text).toContain('#ff0000');expect(red.name).toBe('red.svg');
  await page.locator('#canvas').focus();await page.keyboard.press('Control+a');await page.keyboard.press('ArrowRight');
  await page.locator('#undo').click();await page.locator('#redo').click();
  expect(await saved(page)).toEqual(blue);
  page.once('dialog',d=>d.accept());await page.reload();await state(page,'paused');expect((await exportSVG(page)).text).toContain('#0000ff');
  expect(await saved(page)).toEqual(blue);
});

test('owner reload recovers ownership; closing it never silently promotes a paused tab',async({page,context})=>{
  await page.goto('/');await state(page,'saved');await openDrawing(page,'red');await state(page,'saved');
  const second=await context.newPage();await second.goto('/');await state(second,'paused');await openDrawing(second,'blue');
  const red=await saved(page);await page.reload();await state(page,'saved');expect(await saved(page)).toEqual(red);
  await page.close();await second.bringToFront();await state(second,'paused');expect(await saved(second)).toEqual(red);
  const third=await context.newPage();await third.goto('/');await state(third,'saved');expect(await saved(third)).toEqual(red);
  await takeOver(second);await state(second,'saved');await state(third,'paused');expect((await saved(second)).name).toBe('blue');
});

test('simultaneous tabs elect one owner and serialized competing transfers keep exactly one writer',async({context})=>{
  const pages=await Promise.all([context.newPage(),context.newPage(),context.newPage()]);
  await Promise.all(pages.map(page=>page.goto('/')));
  await expect.poll(async()=>Promise.all(pages.map(page=>page.locator('#browser-recovery').getAttribute('data-state')))).not.toContain('checking');
  const modes=await Promise.all(pages.map(page=>page.locator('#browser-recovery').getAttribute('data-state')));
  expect(modes.filter(mode=>mode==='saved')).toHaveLength(1);expect(modes.filter(mode=>mode==='paused')).toHaveLength(2);
  const others=pages.filter((_,i)=>modes[i]==='paused');
  await openDrawing(others[0],'red');await openDrawing(others[1],'blue');
  await Promise.all(others.map(page=>takeOver(page)));
  await expect.poll(async()=>(await Promise.all(pages.map(page=>page.locator('#browser-recovery').getAttribute('data-state')))).filter(mode=>mode==='saved').length).toBe(1);
  for(const page of pages)if(await page.locator('#browser-recovery').getAttribute('data-state')==='paused'){
    const current=await saved(page);await openDrawing(page,'green');expect(await saved(page)).toEqual(current);
  }
});

test('storage failure stays visible and a paused tab warns before closing',async({page,context})=>{
  await page.goto('/');await state(page,'saved');
  await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('Full','QuotaExceededError');};});
  await openDrawing(page,'red');await state(page,'unavailable');
  await expect(page.locator('#recovery-status')).toContainText('Save SVG');
  expect((await exportSVG(page)).text).toContain('#ff0000');
  const second=await context.newPage();await second.goto('/');await state(second,'paused');await openDrawing(second,'blue');
  const warning=second.waitForEvent('dialog');await second.close({runBeforeUnload:true});
  const dialog=await warning;expect(dialog.type()).toBe('beforeunload');await dialog.accept();
});

test('transfer waits for the owner to release its lock before saving the new drawing',async({page,context})=>{
  await page.goto('/');await state(page,'saved');await openDrawing(page,'red');
  const second=await context.newPage();await second.goto('/');await state(second,'paused');await openDrawing(second,'blue');
  const original=await saved(second);
  // Delay the owner's response, allowing edits while the other tab is waiting.
  await page.evaluate(()=>{
    const query=navigator.locks.query.bind(navigator.locks);
    const gate=new Promise(resolve=>{window.releaseRecoveryTransfer=resolve;});
    navigator.locks.query=async()=>{await gate;return query();};
  });
  try{
    await takeOver(second);
    await expect(second.locator('#take-over-recovery')).toBeDisabled();
    await expect(second.locator('#take-over-recovery')).toContainText('Waiting');
    await expect.poll(()=>second.evaluate(async()=>(await navigator.locks.query()).pending.some(lock=>lock.name==='vector-lab-browser-recovery'))).toBe(true);
    expect(await saved(second)).toEqual(original);
    await openDrawing(page,'green');expect((await saved(second)).name).toBe('green');
  }finally{await page.evaluate(()=>window.releaseRecoveryTransfer());}
  await state(second,'saved');await state(page,'paused');expect((await saved(second)).name).toBe('blue');
});

test('unavailable coordination disables recovery without preventing editing or SVG export',async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(navigator,'locks',{value:undefined}));
  await page.goto('/');await state(page,'unavailable');await openDrawing(page,'red');
  expect((await saved(page)).drawing).toBeNull();
  expect((await exportSVG(page)).text).toContain('#ff0000');
  await expect(page.locator('#recovery-status')).toContainText('unavailable');
});
