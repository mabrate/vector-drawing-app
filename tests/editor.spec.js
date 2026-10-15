async function panelLocator(page,selector){const name=selector.startsWith('[data-align')?'align':['#fill','#stroke','#width'].includes(selector)?'style':null;if(name&&await page.locator(`#panel-${name}`).isHidden())await page.locator(`[data-panel="${name}"]`).click();return page.locator(selector);}
import {test,expect} from '@playwright/test';
// Existing precision-editing checks run with the optional dimensions tool enabled.
test.beforeEach(async({page})=>{await page.addInitScript(()=>{if(localStorage.getItem('vector-lab-dimensions')===null)localStorage.setItem('vector-lab-dimensions','true');});});
async function draw(page,tool,a,b){await page.locator(`[data-tool="${tool}"]`).click();const r=await page.locator('#canvas').boundingBox();await page.mouse.move(r.x+a[0],r.y+a[1]);await page.mouse.down();await page.mouse.move(r.x+b[0],r.y+b[1],{steps:8});await page.mouse.up();}
async function svg(page){const waiting=page.waitForEvent('download');await page.locator('#save').click();await page.locator('#download-svg').click();const download=await waiting;return {text:await (await download.createReadStream()).toArray().then(a=>Buffer.concat(a).toString()),path:await download.path()};}
test('shape operations, undo, SVG download/open, and browser recovery',async({page})=>{const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await draw(page,'rectangle',[100,140],[240,250]);await draw(page,'ellipse',[170,170],[300,290]);await page.locator('[data-tool="select"]').click();await (await panelLocator(page,'#multi')).check();const r=await page.locator('#canvas').boundingBox();await page.mouse.click(r.x+120,r.y+160);await (await panelLocator(page,'[data-boolean="unite"]')).click();let output=await svg(page);expect((output.text.match(/<path/g)||[]).length).toBe(1);await page.locator('#undo').click();output=await svg(page);expect((output.text.match(/<path/g)||[]).length).toBe(2);await page.reload();output=await svg(page);expect((output.text.match(/<path/g)||[]).length).toBe(2);page.on('dialog',d=>d.accept());await page.locator('#new').click();await page.locator('#file').setInputFiles({name:'drawing.svg',mimeType:'image/svg+xml',buffer:Buffer.from(output.text)});await expect(page.locator('#status')).toContainText('SVG opened');const reopened=await svg(page);expect((reopened.text.match(/<path/g)||[]).length).toBe(2);expect(errors).toEqual([]);});
test('pen curves and node movement survive SVG export',async({page})=>{await page.goto('/');await page.locator('[data-tool="pen"]').click();const r=await page.locator('#canvas').boundingBox();await page.mouse.click(r.x+130,r.y+170);await page.mouse.move(r.x+250,r.y+210);await page.mouse.down();await page.mouse.move(r.x+280,r.y+160);await page.mouse.up();await page.mouse.click(r.x+260,r.y+320);await page.mouse.click(r.x+130,r.y+170);await page.locator('[data-tool="nodes"]').click();await page.mouse.move(r.x+130,r.y+170);await page.mouse.down();await page.mouse.move(r.x+110,r.y+150);await page.mouse.up();const output=await svg(page);expect(output.text).toMatch(/<path/);expect(output.text).toMatch(/c|C/);expect(output.text).toMatch(/z/i);});
test('touch drawing, pinch zoom, and tablet layout',async({page})=>{await page.goto('/');await page.locator('[data-tool="rectangle"]').click();await page.locator('#canvas').dispatchEvent('pointerdown',{pointerId:1,pointerType:'touch',clientX:220,clientY:280,bubbles:true});await page.locator('#canvas').dispatchEvent('pointermove',{pointerId:1,pointerType:'touch',clientX:350,clientY:380,bubbles:true});await page.locator('#canvas').dispatchEvent('pointerup',{pointerId:1,pointerType:'touch',clientX:350,clientY:380,bubbles:true});const output=await svg(page);expect(output.text).toContain('<path');const cdp=await page.context().newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:260,y:300},{x:360,y:300}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:230,y:310},{x:400,y:310}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});expect((await svg(page)).text).toBe(output.text);await page.screenshot({path:'/tmp/vector-lab-tablet.png'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);});
async function loadDrawing(page,content){page.once('dialog',d=>d.accept());await page.locator('#file').setInputFiles({name:'test.svg',mimeType:'image/svg+xml',buffer:Buffer.from(content)});await expect(page.locator('#status')).toContainText('SVG opened');}
async function projectPoint(page,x,y){return page.locator('#canvas').evaluate((c,{x,y})=>{const r=c.getBoundingClientRect(),z=Math.min((r.width-50)/1056,(r.height-50)/816);return {x:r.x+r.width/2+(x-528)*z,y:r.y+r.height/2+(y-408)*z};},{x,y});}
async function moveProject(page,from,to){const a=await projectPoint(page,...from),b=await projectPoint(page,...to);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:5});}
test('pen shows handles live; smooth handles stay collinear with independent mode available',async({page})=>{await page.goto('/');await page.locator('#snap-button').click();await page.locator('#snapping').uncheck();await page.locator('#snap-button').click();await page.locator('[data-tool="pen"]').click();await moveProject(page,[300,300],[360,250]);const orange=await page.locator('#canvas').evaluate(c=>{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<d.length;i+=4)if(d[i]>150&&d[i+1]>65&&d[i+1]<170&&d[i+2]<100)n++;return n;});expect(orange).toBeGreaterThan(10);await page.mouse.up();await loadDrawing(page,'<svg xmlns="http://www.w3.org/2000/svg"><path d="M100 300 C180 300 240 300 300 300 C360 300 420 300 500 300" fill="none" stroke="black"/></svg>');await page.locator('[data-tool="nodes"]').click();const anchor=await projectPoint(page,300,300);await page.mouse.click(anchor.x,anchor.y);await moveProject(page,[360,300],[370,360]);await page.mouse.up();let segments=await page.evaluate(()=>JSON.parse(localStorage.getItem('vector-lab'))[1].children[0][1].segments);let a=segments[1][1],b=segments[1][2];expect(Math.abs(a[0]*b[1]-a[1]*b[0])).toBeLessThan(.01);expect(a[0]*b[0]+a[1]*b[1]).toBeLessThan(0);await page.locator('#linked').uncheck();await moveProject(page,[370,360],[390,300]);await page.mouse.up();segments=await page.evaluate(()=>JSON.parse(localStorage.getItem('vector-lab'))[1].children[0][1].segments);a=segments[1][1];b=segments[1][2];expect(Math.abs(a[0]*b[1]-a[1]*b[0])).toBeGreaterThan(100);});
test('inline color picker stays inside panel and updates saved fill',async({page})=>{await page.setViewportSize({width:768,height:1024});await page.goto('/');await draw(page,'rectangle',[80,150],[180,250]);await (await panelLocator(page,'#fill')).click();await expect(page.locator('#fill-picker')).toBeVisible();await page.getByRole('button',{name:'fill #dd658c',exact:true}).click();const result=await svg(page);expect(result.text).toContain('#dd658c');const bounds=await page.locator('#fill-picker').boundingBox();expect(bounds.x+bounds.width).toBeLessThanOrEqual(768);});
test('marquee selects enclosed shapes and resize handles scale selection with undo',async({page})=>{await page.goto('/');await page.locator('#snap-button').click();await page.locator('#snapping').uncheck();await page.locator('#snap-button').click();await loadDrawing(page,'<svg xmlns="http://www.w3.org/2000/svg"><path d="M100 100h100v100h-100z"/><path d="M300 100h100v100h-100z"/><path d="M600 100h100v100h-100z"/></svg>');await page.locator('[data-tool="select"]').click();await moveProject(page,[70,70],[430,230]);await page.mouse.up();await moveProject(page,[400,200],[550,250]);await page.mouse.up();let data=await page.evaluate(()=>JSON.parse(localStorage.getItem('vector-lab'))[1].children.map(i=>i[1].segments));const point=s=>Array.isArray(s[0])?s[0]:s;expect(point(data[0][0])[0]).toBeCloseTo(100,1);expect(point(data[1][1])[0]).toBeCloseTo(550,1);expect(point(data[1][2])[1]).toBeCloseTo(250,1);expect(point(data[2][0])[0]).toBeCloseTo(600,1);await page.locator('#undo').click();data=await page.evaluate(()=>JSON.parse(localStorage.getItem('vector-lab'))[1].children[1][1].segments);expect(point(data[1])[0]).toBeCloseTo(400,1);});
test('double click toggles anchor between smooth and corner',async({page})=>{await page.goto('/');await loadDrawing(page,'<svg xmlns="http://www.w3.org/2000/svg"><path d="M100 300 C180 300 240 300 300 300 C360 300 420 300 500 300" fill="none" stroke="black"/></svg>');await page.locator('[data-tool="nodes"]').click();const p=await projectPoint(page,300,300);await page.mouse.dblclick(p.x,p.y);let s=await page.evaluate(()=>JSON.parse(localStorage.getItem('vector-lab'))[1].children[0][1].segments[1]);expect(s[1]).toEqual([-60,0]);await page.mouse.dblclick(p.x,p.y);s=await page.evaluate(()=>JSON.parse(localStorage.getItem('vector-lab'))[1].children[0][1].segments[1]);expect(s).toEqual([300,300]);await page.mouse.dblclick(p.x,p.y);s=await page.evaluate(()=>JSON.parse(localStorage.getItem('vector-lab'))[1].children[0][1].segments[1]);expect(s[1][0]*s[2][0]+s[1][1]*s[2][1]).toBeLessThan(0);});
test('snap stays on an alignment under small pointer movements',async({page})=>{await page.goto('/');await loadDrawing(page,'<svg xmlns="http://www.w3.org/2000/svg"><path d="M100 100h100v100h-100z"/><path d="M300 300h100v100h-100z"/></svg>');await page.locator('[data-tool="select"]').click();await moveProject(page,[350,350],[154,350]);const xs=[];for(const x of [156,152,158,153]){const p=await projectPoint(page,x,350);await page.mouse.move(p.x,p.y);const row=await projectPoint(page,0,350);xs.push(await page.locator('#canvas').evaluate((c,y)=>{const r=c.getBoundingClientRect(),data=c.getContext('2d').getImageData(0,Math.round((y-r.y)*c.height/r.height),c.width,1).data;for(let x=0;x<c.width;x++)if(data[x*4]<30&&data[x*4+1]<30&&data[x*4+2]<30&&data[x*4+3]>200)return x;return -1;},row.y));}await page.mouse.up();expect(xs.every(x=>x>=0)).toBe(true);expect(new Set(xs).size).toBe(1);});

test('touch double tap toggles an anchor',async({page})=>{await page.goto('/');await loadDrawing(page,'<svg xmlns="http://www.w3.org/2000/svg"><path d="M100 300 C180 300 240 300 300 300 C360 300 420 300 500 300" fill="none" stroke="black"/></svg>');await page.locator('[data-tool="nodes"]').click();const p=await projectPoint(page,300,300),cdp=await page.context().newCDPSession(page);for(let i=0;i<2;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x,y:p.y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}const s=await page.evaluate(()=>JSON.parse(localStorage.getItem('vector-lab'))[1].children[0][1].segments[1]);expect(s[1]).toEqual([-60,0]);expect(s[2]).toEqual([60,0]);});
test('landscape Letter export, physical selection sizing, page sizing, recovery and SVG round trip',async({page})=>{await page.goto('/');await draw(page,'rectangle',[100,100],[180,180]);await (await panelLocator(page,'#dimension-width')).fill('2');await (await panelLocator(page,'#dimension-height')).fill('1');await page.locator('#dimension-height').press('Enter');await page.locator('#units').selectOption('mm',{force:true});await expect((await panelLocator(page,'#dimension-width'))).toHaveValue('50.8');await expect((await panelLocator(page,'#dimension-height'))).toHaveValue('25.4');await page.locator('#units').selectOption('pt',{force:true});await expect((await panelLocator(page,'#dimension-width'))).toHaveValue('144');await page.locator('#units').selectOption('px',{force:true});await expect((await panelLocator(page,'#dimension-width'))).toHaveValue('192');let output=await svg(page);expect(output.text).toContain('width="11in"');expect(output.text).toContain('height="8.5in"');expect(output.text).toContain('viewBox="0 0 1056 816"');await loadDrawing(page,output.text);await page.keyboard.press('Control+a');await expect((await panelLocator(page,'#dimension-width'))).toHaveValue('192');await page.locator('#units').selectOption('in',{force:true});await page.locator('#page-settings summary').click();await page.locator('#page-width').fill('10');await page.locator('#page-height').fill('7');await page.locator('#page-height').press('Enter');await page.locator('#undo').click();await expect(page.locator('#page-width')).toHaveValue('10');await expect(page.locator('#page-height')).toHaveValue('8.5');await page.locator('#redo').click();await page.reload();await page.locator('#page-settings summary').click();await expect(page.locator('#page-width')).toHaveValue('10');await expect(page.locator('#page-height')).toHaveValue('7');});
test('select all, duplicate, native copy/cut/paste and input text shortcuts',async({page})=>{await page.context().grantPermissions(['clipboard-read','clipboard-write']);await page.goto('/');await draw(page,'rectangle',[100,100],[180,180]);await page.keyboard.press('Control+a');await page.keyboard.press('Control+d');let count=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('vector-lab'))[1].children.length);expect(await count()).toBe(2);await page.keyboard.press('Control+c');await page.keyboard.press('Control+v');await expect.poll(count).toBe(3);await page.keyboard.press('Control+x');await expect.poll(count).toBe(2);await page.keyboard.press('Control+v');await expect.poll(count).toBe(3);await page.keyboard.press('Meta+a');await page.keyboard.press('Meta+d');expect(await count()).toBe(6);await (await panelLocator(page,'#dimension-width')).focus();await page.keyboard.press('Control+a');await page.keyboard.press('Control+c');expect(await count()).toBe(6);await (await panelLocator(page,'#dimension-width')).blur();await page.keyboard.press('Control+z');expect(await count()).toBe(3);});
async function modifierDrag(page,from,to,keys=[]){const a=await projectPoint(page,...from),b=await projectPoint(page,...to);await page.mouse.move(a.x,a.y);await page.mouse.down();for(const key of keys)await page.keyboard.down(key);await page.mouse.move(b.x,b.y,{steps:8});await page.mouse.up();for(const key of keys)await page.keyboard.up(key);}
async function selectionSize(page){await page.locator('#units').selectOption('px',{force:true});return {width:Number(await (await panelLocator(page,'#dimension-width')).inputValue()),height:Number(await (await panelLocator(page,'#dimension-height')).inputValue())};}
test('Ctrl and Shift draw constrained shapes from the center in either direction',async({page})=>{await page.goto('/');await page.locator('#snap-button').click();await page.locator('#snapping').uncheck();await page.locator('#snap-button').click();await page.locator('[data-tool="ellipse"]').click();await modifierDrag(page,[300,300],[400,350],['Control','Shift']);const circleSize=await selectionSize(page);expect(circleSize.width).toBeCloseTo(200,2);expect(circleSize.height).toBeCloseTo(200,2);let data=await page.evaluate(()=>JSON.parse(localStorage.getItem('vector-lab'))[1].children[0][1].segments);const anchors=data.map(s=>Array.isArray(s[0])?s[0]:s);expect(Math.min(...anchors.map(p=>p[0]))).toBeCloseTo(200,1);expect(Math.min(...anchors.map(p=>p[1]))).toBeCloseTo(200,1);await page.locator('[data-tool="rectangle"]').click();await modifierDrag(page,[600,400],[520,350],['Shift']);const rectangleSize=await selectionSize(page);expect(rectangleSize.width).toBeCloseTo(160,2);expect(rectangleSize.height).toBeCloseTo(100,2);await modifierDrag(page,[600,600],[650,620],['Control']);const squareSize=await selectionSize(page);expect(squareSize.width).toBeCloseTo(50,2);expect(squareSize.height).toBeCloseTo(50,2);});
test('Ctrl constrains corner and side resizing, Shift keeps the center fixed',async({page})=>{await page.goto('/');await page.locator('#snap-button').click();await page.locator('#snapping').uncheck();await page.locator('#snap-button').click();const drawing='<svg xmlns="http://www.w3.org/2000/svg"><path d="M100 100h100v50h-100z"/></svg>';for(const [keys,from,to,size,first] of [[['Control'],[200,150],[300,175],[200,100],[100,100]],[['Shift'],[200,150],[250,175],[200,100],[50,75]],[['Control','Shift'],[200,125],[250,125],[200,100],[50,75]]]){await loadDrawing(page,drawing);await page.keyboard.press('Control+a');await modifierDrag(page,from,to,keys);const resized=await selectionSize(page);expect(resized.width).toBeCloseTo(size[0],2);expect(resized.height).toBeCloseTo(size[1],2);const s=await page.evaluate(()=>JSON.parse(localStorage.getItem('vector-lab'))[1].children[0][1].segments[0]);const p=Array.isArray(s[0])?s[0]:s;expect(p[0]).toBeCloseTo(first[0],1);expect(p[1]).toBeCloseTo(first[1],1);}});
test('rotation handle rotates around center and supports undo and SVG reopening',async({page})=>{await page.goto('/');await loadDrawing(page,'<svg xmlns="http://www.w3.org/2000/svg"><path d="M100 100h200v100h-200z"/></svg>');await page.keyboard.press('Control+a');const z=await page.locator('#canvas').evaluate(c=>Math.min((c.clientWidth-50)/1056,(c.clientHeight-50)/816));await modifierDrag(page,[200,100-32/z],[250+32/z,150]);expect(await selectionSize(page)).toEqual({width:100,height:200});await page.locator('#undo').click();await page.keyboard.press('Control+a');expect(await selectionSize(page)).toEqual({width:200,height:100});await page.locator('#redo').click();const output=await svg(page);await loadDrawing(page,output.text);await page.keyboard.press('Control+a');expect(await selectionSize(page)).toEqual({width:100,height:200});});
test('arrow nudges and explicit positions use document units, preserve spacing, and undo',async({page})=>{await page.goto('/');await loadDrawing(page,'<svg xmlns="http://www.w3.org/2000/svg"><path d="M100 100h100v100h-100z"/><path d="M300 100h100v100h-100z"/></svg>');await page.keyboard.press('Control+a');await page.locator('#units').selectOption('px',{force:true});await page.locator('#canvas').focus();await page.keyboard.press('=');await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowDown');await page.keyboard.press('Shift+ArrowLeft');await expect((await panelLocator(page,'#position-x'))).toHaveValue('91');await expect((await panelLocator(page,'#position-y'))).toHaveValue('101');await expect((await panelLocator(page,'#dimension-width'))).toHaveValue('300');await page.locator('#units').selectOption('mm',{force:true});await (await panelLocator(page,'#position-x')).fill('25.4');await (await panelLocator(page,'#position-y')).fill('50.8');await (await panelLocator(page,'#apply-position')).click();await page.locator('#units').selectOption('px',{force:true});await expect((await panelLocator(page,'#position-x'))).toHaveValue('96');await expect((await panelLocator(page,'#position-y'))).toHaveValue('192');await expect((await panelLocator(page,'#dimension-width'))).toHaveValue('300');await page.locator('#undo').click();await page.keyboard.press('Control+a');await expect((await panelLocator(page,'#position-x'))).toHaveValue('91');await expect((await panelLocator(page,'#position-y'))).toHaveValue('101');await page.locator('#redo').click();await page.keyboard.press('Control+a');await page.locator('#units').selectOption('in',{force:true});await expect((await panelLocator(page,'#position-x'))).toHaveValue('1');await expect((await panelLocator(page,'#position-y'))).toHaveValue('2');await page.locator('#units').selectOption('pt',{force:true});await expect((await panelLocator(page,'#position-x'))).toHaveValue('72');await expect((await panelLocator(page,'#position-y'))).toHaveValue('144');const before=await page.evaluate(()=>localStorage.getItem('vector-lab'));await (await panelLocator(page,'#position-x')).focus();await page.keyboard.press('ArrowRight');expect(await page.evaluate(()=>localStorage.getItem('vector-lab'))).toBe(before);await page.locator('#units').selectOption('px',{force:true});await (await panelLocator(page,'#position-x')).fill('-10');await (await panelLocator(page,'#position-y')).fill('0');await (await panelLocator(page,'#apply-position')).click();await expect((await panelLocator(page,'#position-x'))).toHaveValue('-10');const output=await svg(page);await loadDrawing(page,output.text);await page.keyboard.press('Control+a');await expect((await panelLocator(page,'#position-x'))).toHaveValue('-10');await expect((await panelLocator(page,'#position-y'))).toHaveValue('0');await expect((await panelLocator(page,'#dimension-width'))).toHaveValue('300');await expect(page.locator('.context #position-x')).toBeEnabled();await expect(page.locator('.context #dimension-width')).toBeVisible();});
async function blackBounds(page){return page.locator('#canvas').evaluate(c=>{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let left=c.width,top=c.height,right=0,bottom=0;for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){const i=(y*c.width+x)*4;if(d[i]<25&&d[i+1]<25&&d[i+2]<25&&d[i+3]>200){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}}return {left,top,right,bottom};});}
test('trackpad wheel pans both axes without editing artwork',async({page})=>{await page.goto('/');await loadDrawing(page,'<svg xmlns="http://www.w3.org/2000/svg"><path d="M300 300h100v100h-100z"/></svg>');const before=await blackBounds(page),saved=await page.evaluate(()=>localStorage.getItem('vector-lab'));const p=await projectPoint(page,350,350);await page.mouse.move(p.x,p.y);await page.mouse.wheel(60,40);await expect.poll(async()=> (await blackBounds(page)).left).toBe(before.left-60);const after=await blackBounds(page);expect(after.top).toBe(before.top-40);expect(after.right-after.left).toBe(before.right-before.left);expect(await page.evaluate(()=>localStorage.getItem('vector-lab'))).toBe(saved);});
test('two-finger touch pans and cancels a first-finger shape move',async({page})=>{await page.goto('/');await loadDrawing(page,'<svg xmlns="http://www.w3.org/2000/svg"><path d="M300 300h100v100h-100z"/></svg>');await page.keyboard.press('Control+a');const before=await blackBounds(page),saved=await page.evaluate(()=>localStorage.getItem('vector-lab')),p=await projectPoint(page,350,350),cdp=await page.context().newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:p.x,y:p.y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:p.x+10,y:p.y+10}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:p.x+10,y:p.y+10},{id:2,x:p.x+110,y:p.y+10}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:p.x+90,y:p.y+70},{id:2,x:p.x+190,y:p.y+70}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});const after=await blackBounds(page);expect(after.left-before.left).toBeCloseTo(80,0);expect(after.top-before.top).toBeCloseTo(60,0);expect(after.right-after.left).toBe(before.right-before.left);expect(await page.evaluate(()=>localStorage.getItem('vector-lab'))).toBe(saved);expect((await svg(page)).text).toContain('M300,300');});
test('color gradients react to HSL changes and stroke units preserve physical width',async({page})=>{await page.goto('/');await draw(page,'rectangle',[100,100],[200,200]);await page.locator('#units').selectOption('pt',{force:true});await expect((await panelLocator(page,'#width'))).toHaveValue('2.25');await (await panelLocator(page,'#width')).fill('6');await (await panelLocator(page,'#width')).dispatchEvent('change');await page.locator('#units').selectOption('px',{force:true});await expect((await panelLocator(page,'#width'))).toHaveValue('8');await page.locator('#units').selectOption('mm',{force:true});expect(Number(await (await panelLocator(page,'#width')).inputValue())).toBeCloseTo(8*25.4/96,6);const output=await svg(page);expect(output.text).toContain('stroke-width="8"');for(const id of ['fill','stroke']){await page.locator(`#${id}`).click();const hue=page.getByRole('slider',{name:`${id} hue`,exact:true}),sat=page.getByRole('slider',{name:`${id} saturation`,exact:true}),light=page.getByRole('slider',{name:`${id} lightness`,exact:true});const before=await sat.evaluate(e=>e.style.getPropertyValue('--range-gradient'));await hue.fill('240');await hue.dispatchEvent('input');expect(await sat.evaluate(e=>e.style.getPropertyValue('--range-gradient'))).not.toBe(before);expect(await hue.evaluate(e=>e.style.getPropertyValue('--range-gradient'))).toContain('linear-gradient');await sat.fill('100');await sat.dispatchEvent('input');expect(await light.evaluate(e=>e.style.getPropertyValue('--range-gradient'))).toContain('240 100% 50%');await page.screenshot({path:`/tmp/vector-lab-${id}-gradients.png`});}});
async function savedAnchor(page,index){return page.evaluate(index=>{const s=JSON.parse(localStorage.getItem('vector-lab'))[1].children[index][1].segments[0];return Array.isArray(s[0])?s[0]:s;},index);}
test('alignment uses last selected reference in either order, or page for one shape',async({page})=>{await page.goto('/');const drawing='<svg xmlns="http://www.w3.org/2000/svg"><path d="M100 100h100v100h-100z"/><path d="M300 300h100v100h-100z"/></svg>';for(const reverse of [false,true]){await loadDrawing(page,drawing);await (await panelLocator(page,'#multi')).check();for(const xy of reverse?[[350,350],[150,150]]:[[150,150],[350,350]]){const p=await projectPoint(page,...xy);await page.mouse.click(p.x,p.y);}await (await panelLocator(page,'[data-align="left"]')).click();expect(await savedAnchor(page,0)).toEqual([reverse?100:300,100]);expect(await savedAnchor(page,1)).toEqual([reverse?100:300,300]);}await loadDrawing(page,'<svg xmlns="http://www.w3.org/2000/svg"><path d="M100 100h100v100h-100z"/></svg>');await page.keyboard.press('Control+a');await (await panelLocator(page,'[data-align="right"]')).click();await (await panelLocator(page,'[data-align="middle"]')).click();expect(await savedAnchor(page,0)).toEqual([956,358]);await expect(page.locator('#status')).toContainText('Aligned to page');});
test('fill and stroke transparency remain independent and survive SVG reopening',async({page})=>{await page.goto('/');await draw(page,'rectangle',[150,150],[280,280]);await (await panelLocator(page,'#fill')).click();await page.getByRole('slider',{name:'fill transparency',exact:true}).fill('50');await page.getByRole('slider',{name:'fill transparency',exact:true}).dispatchEvent('input');await (await panelLocator(page,'#stroke')).click();await page.getByRole('slider',{name:'stroke transparency',exact:true}).fill('25');await page.getByRole('slider',{name:'stroke transparency',exact:true}).dispatchEvent('input');const output=await svg(page);expect(output.text).toContain('fill-opacity="0.5"');expect(output.text).toContain('stroke-opacity="0.75"');await loadDrawing(page,output.text);await page.keyboard.press('Control+a');await (await panelLocator(page,'#fill')).click();await expect(page.getByRole('slider',{name:'fill transparency',exact:true})).toHaveValue('50');await (await panelLocator(page,'#stroke')).click();await expect(page.getByRole('slider',{name:'stroke transparency',exact:true})).toHaveValue('25');await page.screenshot({path:'/tmp/vector-lab-transparency.png'});});
test('numeric color fields and sliders synchronize and retain independent transparency',async({page})=>{await page.goto('/');await draw(page,'rectangle',[100,100],[200,200]);for(const id of ['fill','stroke']){await page.locator(`#${id}`).click();for(const [channel,value] of [['hue','240'],['saturation','100'],['lightness','50'],['transparency','37.5']]){const number=page.getByRole('spinbutton',{name:`${id} ${channel} value`,exact:true}),slider=page.getByRole('slider',{name:`${id} ${channel}`,exact:true});await number.fill(value);await expect(slider).toHaveValue(value);await expect(number).toHaveValue(value);}const hue=page.getByRole('slider',{name:`${id} hue`,exact:true});await hue.fill('120');await hue.dispatchEvent('input');await expect(page.getByRole('spinbutton',{name:`${id} hue value`,exact:true})).toHaveValue('120');const number=page.getByRole('spinbutton',{name:`${id} transparency value`,exact:true});await number.fill('');await number.blur();await expect(number).toHaveValue('37.5');}const result=await svg(page);expect(result.text).toContain('fill-opacity="0.625"');expect(result.text).toContain('stroke-opacity="0.625"');});
test('visible-edge alignment includes different stroke widths and paths remain optional',async({page})=>{await page.goto('/');const source='<svg xmlns="http://www.w3.org/2000/svg"><path d="M100 100h100v100h-100z" fill="red" stroke="black" stroke-width="10"/><path d="M300 300h100v100h-100z" fill="blue" stroke="black" stroke-width="2"/></svg>';await loadDrawing(page,source);await page.keyboard.press('Control+a');await(await panelLocator(page,'[data-align="left"]')).click();expect(await savedAnchor(page,0)).toEqual([304,100]);expect(await savedAnchor(page,1)).toEqual([300,300]);await page.locator('#align-bounds').selectOption('paths');await page.locator('[data-align="left"]').click();expect(await savedAnchor(page,0)).toEqual([300,100]);await loadDrawing(page,'<svg xmlns="http://www.w3.org/2000/svg"><path d="M100 100h100v100h-100z" stroke="black" stroke-width="10"/></svg>');await page.keyboard.press('Control+a');await page.locator('#align-bounds').selectOption('visible');await page.locator('[data-align="right"]').click();expect(await savedAnchor(page,0)).toEqual([951,100]);});
test('distribution equalizes visible gaps and edge positions, preserving endpoints',async({page})=>{await page.goto('/');await loadDrawing(page,'<svg xmlns="http://www.w3.org/2000/svg"><path d="M100 200h50v100h-50z"/><path d="M200 200h100v100h-100z"/><path d="M500 200h100v100h-100z"/></svg>');await page.keyboard.press('Control+a');await page.locator('[data-panel="align"]').click();await page.locator('[data-distribute="hgap"]').click();expect(await savedAnchor(page,0)).toEqual([100,200]);expect(await savedAnchor(page,1)).toEqual([275,200]);expect(await savedAnchor(page,2)).toEqual([500,200]);await page.locator('[data-distribute="left"]').click();expect(await savedAnchor(page,1)).toEqual([300,200]);await page.locator('#undo').click();expect(await savedAnchor(page,1)).toEqual([275,200]);});
test('toolbar stacking moves selected objects one level or to either end',async({page})=>{await page.goto('/');await loadDrawing(page,'<svg xmlns="http://www.w3.org/2000/svg"><path d="M100 100h100v100h-100z" fill="red"/><path d="M300 100h100v100h-100z" fill="blue"/><path d="M500 100h100v100h-100z" fill="green"/></svg>');const p=await projectPoint(page,150,150);await page.mouse.click(p.x,p.y);await page.locator('#raise').click();expect(await savedAnchor(page,1)).toEqual([100,100]);await page.locator('#front').click();expect(await savedAnchor(page,2)).toEqual([100,100]);await page.locator('#lower').click();expect(await savedAnchor(page,1)).toEqual([100,100]);await page.locator('#back').click();expect(await savedAnchor(page,0)).toEqual([100,100]);});
test('multi-node corner, round and symmetric settings preserve independent handles and SVG modes',async({page})=>{await page.goto('/');await loadDrawing(page,'<svg xmlns="http://www.w3.org/2000/svg"><path d="M100 200 C180 200 240 200 300 200 C340 200 420 200 500 200" fill="none" stroke="black"/></svg>');await page.locator('[data-tool="nodes"]').click();await page.locator('#snap-button').click();await page.locator('#snapping').uncheck();await page.locator('#snap-button').click();const a=await projectPoint(page,100,200),b=await projectPoint(page,300,200);await page.mouse.click(a.x,a.y);await page.keyboard.down('Shift');await page.mouse.click(b.x,b.y);await page.keyboard.up('Shift');await expect(page.locator('#node-count')).toHaveText('2 nodes selected');await page.locator('#node-corner').click();let data=await page.evaluate(()=>JSON.parse(localStorage.getItem('vector-lab'))[1].children[0][1]);expect(data.segments[1][1]).toEqual([-60,0]);expect(data.segments[1][2]).toEqual([40,0]);expect(data.data.nodeModes['1']).toBe('corner');const saved=await svg(page);await loadDrawing(page,saved.text);await page.locator('[data-tool="nodes"]').click();await page.mouse.click(b.x,b.y);await modifierDrag(page,[340,200],[340,250]);data=await page.evaluate(()=>JSON.parse(localStorage.getItem('vector-lab'))[1].children[0][1]);expect(data.segments[1][1]).toEqual([-60,0]);await page.locator('#node-corner').click();data=await page.evaluate(()=>JSON.parse(localStorage.getItem('vector-lab'))[1].children[0][1]);expect(data.segments[1]).toEqual([300,200]);await page.locator('#node-round').click();await page.locator('#node-symmetric').click();await modifierDrag(page,[330,200],[350,250]);data=await page.evaluate(()=>JSON.parse(localStorage.getItem('vector-lab'))[1].children[0][1]);const incoming=data.segments[1][1],outgoing=data.segments[1][2];expect(incoming[0]).toBeCloseTo(-outgoing[0],3);expect(incoming[1]).toBeCloseTo(-outgoing[1],3);await page.screenshot({path:'/tmp/vector-lab-node-panel.png'});});
test('node box selection and group movement keep the selected anchors together',async({page})=>{await page.goto('/');await loadDrawing(page,'<svg xmlns="http://www.w3.org/2000/svg"><path d="M100 100h100v100h-100z"/></svg>');await page.locator('[data-tool="nodes"]').click();const p=await projectPoint(page,150,150);await page.mouse.click(p.x,p.y);await modifierDrag(page,[60,60],[240,240]);await expect(page.locator('#node-count')).toHaveText('4 nodes selected');await page.locator('#snap-button').click();await page.locator('#snapping').uncheck();await page.locator('#snap-button').click();await page.locator('#multi-nodes').check();await modifierDrag(page,[100,100],[120,130]);await expect(page.locator('#node-count')).toHaveText('4 nodes selected');const segments=await page.evaluate(()=>JSON.parse(localStorage.getItem('vector-lab'))[1].children[0][1].segments);expect(segments[0][0]??segments[0]).toBeDefined();const first=Array.isArray(segments[0][0])?segments[0][0]:segments[0];expect(first[0]).toBeCloseTo(120,2);expect(first[1]).toBeCloseTo(130,2);await page.screenshot({path:'/tmp/vector-lab-node-multiselect.png'});});
async function imageFile(page){const buffer=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=200;c.height=100;const x=c.getContext('2d');x.fillStyle='red';x.fillRect(0,0,100,100);x.fillStyle='blue';x.fillRect(100,0,100,100);return c.toDataURL().split(',')[1];});return {name:'test.png',mimeType:'image/png',buffer:Buffer.from(buffer,'base64')};}
test('insert, crop, reset, recovery and SVG roundtrip preserve embedded image',async({page})=>{const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await page.locator('#image-file').setInputFiles(await imageFile(page));await expect(page.locator('#status')).toContainText('Image inserted');await expect(page.locator('#image-crop')).toBeVisible();await page.locator('#image-crop summary').click();await page.locator('#crop-left').fill('50');await page.locator('#apply-crop').click();let out=await svg(page);expect(out.text).toContain('<image');expect(out.text).toContain('data:image/png;base64,');expect(out.text).toContain('clipPath');await page.reload();out=await svg(page);expect(out.text).toContain('<image');await loadDrawing(page,out.text);const center=await projectPoint(page,578,408);await page.mouse.click(center.x,center.y);await expect(page.locator('#image-crop')).toBeVisible();await page.locator('#image-crop summary').click();await expect(page.locator('#crop-left')).toHaveValue('50');await page.screenshot({path:'/tmp/vector-lab-image-crop.png'});await page.locator('#reset-crop').click();await expect(page.locator('#crop-left')).toHaveValue('0');await page.locator('#undo').click();expect((await svg(page)).text).toContain('&quot;left&quot;:50');expect(errors).toEqual([]);});
test('image clipboard paste and empty clicks deselect with multi-select enabled',async({page})=>{await page.goto('/');const file=await imageFile(page);await page.evaluate(({base64})=>{const data=new DataTransfer();const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));data.items.add(new File([bytes],'paste.png',{type:'image/png'}));document.querySelector('canvas').dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true}));},{base64:file.buffer.toString('base64')});await expect(page.locator('#status')).toContainText('Image inserted');await page.locator('#multi').check();let p=await projectPoint(page,50,50);await page.mouse.click(p.x,p.y);await expect(page.locator('#dimension-width')).toHaveValue('');p=await projectPoint(page,528,408);await page.mouse.click(p.x,p.y);await expect(page.locator('#image-crop')).toBeVisible();await page.keyboard.press('Control+c');await page.keyboard.press('Control+v');await expect.poll(async()=>((await svg(page)).text.match(/<image/g)||[]).length).toBe(2);});
test('drag crop works in reverse direction and supports undo and reset',async({page})=>{await page.goto('/');await page.locator('#image-file').setInputFiles(await imageFile(page));await expect(page.locator('#status')).toContainText('Image inserted');await page.locator('#start-crop').click();await moveProject(page,[620,450],[528,358]);await page.mouse.up();await expect(page.locator('#status')).toContainText('Recovered locally');let output=(await svg(page)).text;expect(output).toContain('clipPath');await page.locator('#image-crop summary').click();expect(Number(await page.locator('#crop-left').inputValue())).toBeCloseTo(50,1);await page.locator('#reset-crop').click();await expect(page.locator('#crop-left')).toHaveValue('0');await page.locator('#undo').click();await page.locator('[data-tool="select"]').click();const p=await projectPoint(page,578,408);await page.mouse.click(p.x,p.y);expect(Number(await page.locator('#crop-left').inputValue())).toBeCloseTo(50,1);});
test('node marquee passes through background images and preserves the path selection',async({page})=>{await page.goto('/');await page.locator('#image-file').setInputFiles(await imageFile(page));await expect(page.locator('#status')).toContainText('Image inserted');await page.locator('#snap-button').click();await page.locator('#snapping').uncheck();await page.locator('#snap-button').click();await page.locator('[data-tool="rectangle"]').click();await moveProject(page,[478,388],[578,428]);await page.mouse.up();await page.locator('[data-tool="nodes"]').click();await moveProject(page,[450,375],[600,440]);await page.mouse.up();await expect(page.locator('#node-count')).toHaveText('4 nodes selected');await page.locator('#node-round').click();expect((await svg(page)).text).toContain('<image');await page.locator('#undo').click();await page.locator('[data-tool="nodes"]').click();const p=await projectPoint(page,500,408);await page.mouse.click(p.x,p.y);await moveProject(page,[500,408],[600,440]);await page.mouse.up();await expect(page.locator('#node-count')).toHaveText('1 node selected');});
test('new smooth handles scale with adjacent edges on small and uneven paths',async({page})=>{await page.goto('/');await loadDrawing(page,'<svg xmlns="http://www.w3.org/2000/svg"><path d="M100 100h6v12h-6z" fill="red"/><path d="M200 100h60v120h-60z" fill="blue"/></svg>');await page.locator('[data-tool="nodes"]').click();await page.keyboard.press('Control+a');await page.locator('#node-round').click();let paths=await page.evaluate(()=>JSON.parse(localStorage.getItem('vector-lab'))[1].children.map(c=>c[1].segments));const length=h=>Math.hypot(...h);expect(length(paths[0][0][1])).toBeCloseTo(4,5);expect(length(paths[0][0][2])).toBeCloseTo(2,5);expect(length(paths[1][0][1])).toBeCloseTo(40,5);expect(length(paths[1][0][2])).toBeCloseTo(20,5);await page.locator('#node-corner').click();await page.locator('#node-corner').click();await page.locator('#node-symmetric').click();paths=await page.evaluate(()=>JSON.parse(localStorage.getItem('vector-lab'))[1].children.map(c=>c[1].segments));for(const seg of paths[0]){expect(length(seg[1])).toBeCloseTo(2,5);expect(length(seg[2])).toBeCloseTo(2,5);}await page.locator('#undo').click();paths=await page.evaluate(()=>JSON.parse(localStorage.getItem('vector-lab'))[1].children.map(c=>c[1].segments));expect(paths[0][0]).toEqual([100,100]);});
test('dropper averages a dragged circle, applies fill or outline and supports undo',async({page})=>{await page.goto('/');await loadDrawing(page,'<svg xmlns="http://www.w3.org/2000/svg"><path d="M100 100h200v400h-200z" fill="#ff0000"/><path d="M300 100h200v400h-200z" fill="#0000ff"/><path d="M340 340h8v8h-8z" fill="#00ff00"/><path d="M600 600h100v100h-100z" fill="#00ff00"/></svg>');let p=await projectPoint(page,650,650);await page.mouse.click(p.x,p.y);await page.locator('[data-tool="dropper"]').click();await moveProject(page,[300,300],[350,300]);await page.screenshot({path:'/tmp/vector-lab-dropper.png'});await page.mouse.up();const hex=await page.locator('#fill').evaluate(el=>el.value);expect(parseInt(hex.slice(1,3),16)).toBeGreaterThan(120);expect(parseInt(hex.slice(1,3),16)).toBeLessThan(135);expect(parseInt(hex.slice(3,5),16)).toBeLessThanOrEqual(2);expect(parseInt(hex.slice(5,7),16)).toBeGreaterThan(120);expect((await svg(page)).text).toContain(`fill="${hex}"`);await page.locator('#undo').click();expect((await svg(page)).text).toContain('fill="#00ff00"');p=await projectPoint(page,650,650);await page.locator('[data-tool="select"]').click();await page.mouse.click(p.x,p.y);await page.locator('[data-tool="dropper"]').click();await page.locator('#dropper-target').selectOption('stroke');p=await projectPoint(page,200,300);await page.mouse.click(p.x,p.y);await expect(page.locator('#status')).toContainText('Sampled #ff0000');expect((await svg(page)).text).toContain('stroke="#ff0000"');});
test('dropper samples embedded image without selection outlines at different zooms',async({page})=>{await page.goto('/');await page.locator('#image-file').setInputFiles(await imageFile(page));await expect(page.locator('#status')).toContainText('Image inserted');await page.locator('[data-tool="dropper"]').click();await moveProject(page,[528,408],[558,408]);await page.mouse.up();let hex=await page.locator('#fill').evaluate(el=>el.value);expect(parseInt(hex.slice(1,3),16)).toBeGreaterThan(120);expect(parseInt(hex.slice(3,5),16)).toBeLessThanOrEqual(2);expect(parseInt(hex.slice(5,7),16)).toBeGreaterThan(120);await page.keyboard.press('=');const canvas=await page.locator('#canvas').boundingBox();await page.mouse.click(canvas.x+canvas.width/2+20,canvas.y+canvas.height/2);expect(await page.locator('#fill').evaluate(el=>el.value)).toBe('#0000ff');const result=await svg(page);expect((result.text.match(/<image/g)||[]).length).toBe(1);expect(result.text).not.toContain('<circle');});

test('text stays editable while outlined exports contain vector paths',async({page})=>{const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await page.locator('[data-tool="text"]').click();await page.locator('#text-content').fill('Hello\nVector');const r=await page.locator('#canvas').boundingBox();await page.mouse.click(r.x+180,r.y+180);await expect(page.locator('#status')).toContainText('Recovered locally');await page.locator('#text-content').fill('Hello\nVectors');await page.locator('#apply-text').click();await expect(page.locator('#status')).toHaveText('Text updated');await page.locator('#text-bold').check();await expect(page.locator('#status')).toHaveText('Text weight updated');let out=await svg(page);expect(out.text).toContain('<text');expect(out.text).toContain('font-weight="bold"');await page.locator('#save').click();await page.locator('#vector-text').check();const waiting=page.waitForEvent('download');await page.locator('#download-svg').click();await expect(page.locator('#status')).toContainText('SVG download started');const download=await waiting;const text=Buffer.concat(await (await download.createReadStream()).toArray()).toString();expect(text).not.toContain('<text');expect(text).toContain('<path');await page.locator('#save').click();await page.locator('#vector-text').uncheck();await page.locator('#export-dialog button[value="cancel"]').click();out=await svg(page);expect(out.text).toContain('<text');await page.locator('[data-tool="nodes"]').click();await expect(page.locator('.context #panel-nodes')).toBeVisible();expect(errors).toEqual([]);});
test('selection dimensions edit in place and pending toolbar edits remain highlighted',async({page})=>{await page.goto('/');await loadDrawing(page,'<svg xmlns="http://www.w3.org/2000/svg"><path d="M100 100h200v100h-200z" fill="red"/></svg>');await page.keyboard.press('Control+a');await page.locator('#units').selectOption('px',{force:true});await expect(page.locator('#selection-width-label')).toHaveValue('200');await page.locator('#selection-width-label').click();await expect(page.locator('#handle-size')).toBeHidden();await expect(page.locator('#selection-width-label')).toBeFocused();await page.locator('#selection-width-label').fill('300');await expect(page.locator('#selection-width-label')).toHaveClass(/pending/);await page.locator('#selection-width-label').press('Enter');await expect(page.locator('#dimension-width')).toHaveValue('300');await page.locator('#dimension-width').fill('250');await expect(page.locator('#dimension-width')).toHaveClass(/pending/);await page.locator('#dimension-height').focus();await expect(page.locator('#dimension-width')).toHaveValue('250');await page.locator('#dimension-height').press('Enter');await expect(page.locator('#dimension-width')).not.toHaveClass(/pending/);await expect(page.locator('#selection-width-label')).toHaveValue('250');await page.locator('#dimension-width').dblclick();expect(await page.locator('#dimension-width').evaluate(el=>el.selectionStart===0&&el.selectionEnd===el.value.length)).toBe(true);await page.locator('#unit-button').click();const button=await page.locator('#unit-button').boundingBox(),menu=await page.locator('#unit-menu').boundingBox();expect(menu.y).toBeGreaterThanOrEqual(button.y+button.height);await page.locator('#unit-menu button').filter({hasText:/^mm$/}).click();await expect(page.locator('#unit-button')).toHaveText('mm ▾');});
test('shape subtracts from a rotated image and survives crop, undo, recovery and SVG reopening',async({page})=>{await page.goto('/');await page.locator('#image-file').setInputFiles(await imageFile(page));await page.locator('#rotate').click();await page.locator('#snap-button').click();await page.locator('#snapping').uncheck();await page.locator('#snap-button').click();const c=await page.locator('#canvas').boundingBox(),a=await projectPoint(page,508,388),b=await projectPoint(page,548,428);await draw(page,'ellipse',[a.x-c.x,a.y-c.y],[b.x-c.x,b.y-c.y]);await page.keyboard.press('Control+a');await (await panelLocator(page,'[data-boolean="subtract"]')).click();await expect(page.locator('#status')).toContainText('Shape subtracted');const center=await projectPoint(page,528,408);const pixel=await page.locator('#canvas').evaluate((el,p)=>{const r=el.getBoundingClientRect();return [...el.getContext('2d').getImageData(Math.round((p.x-r.x)*el.width/r.width),Math.round((p.y-r.y)*el.height/r.height),1,1).data];},center);expect(pixel.slice(0,3)).toEqual([255,255,255]);let output=await svg(page);expect(output.text).toContain('clipPath');expect(output.text).toContain('cutouts');await page.locator('#undo').click();expect((await svg(page)).text).not.toContain('cutouts');await page.locator('#redo').click();await page.reload();output=await svg(page);expect(output.text).toContain('cutouts');await loadDrawing(page,output.text);await page.keyboard.press('Control+a');await page.locator('#image-crop summary').click();await page.locator('#reset-crop').click();await expect(page.locator('#status')).toHaveText('Full image restored');output=await svg(page);expect(output.text).toContain('cutouts');expect(output.text).toContain('<image');const reopenedCenter=await projectPoint(page,528,408);const restoredPixel=await page.locator('#canvas').evaluate((el,p)=>{const r=el.getBoundingClientRect();return [...el.getContext('2d').getImageData(Math.round((p.x-r.x)*el.width/r.width),Math.round((p.y-r.y)*el.height/r.height),1,1).data];},reopenedCenter);expect(restoredPixel.slice(0,3)).toEqual([255,255,255]);});

test('failed vector conversion explains the error in the dialog and editable download still works',async({page})=>{await page.goto('/');await loadDrawing(page,'<svg xmlns="http://www.w3.org/2000/svg"><text x="100" y="100" font-family="serif">Imported text</text></svg>');await page.locator('#save').click();await page.locator('#vector-text').check();await expect(page.locator('#export-status')).toContainText('Select imported text');await expect(page.locator('#export-status')).toBeVisible();await expect(page.locator('#download-svg')).toBeDisabled();await page.locator('#vector-text').uncheck();await expect(page.locator('#download-svg')).toBeEnabled();const waiting=page.waitForEvent('download');await page.locator('#download-svg').click();const download=await waiting;expect(Buffer.concat(await (await download.createReadStream()).toArray()).toString()).toContain('<text');});

test('outlined text retains its page position and transform',async({page})=>{await page.goto('/');await loadDrawing(page,'<svg xmlns="http://www.w3.org/2000/svg" width="1056" height="816"><text transform="translate(240 180) rotate(20) scale(1.5)" font-family="Vector Lab Sans" font-size="32" fill="#52b7a4">Hello</text></svg>');await page.keyboard.press('Control+a');await expect(page.locator('#text-content')).toHaveValue('Hello');const sample=()=>page.locator('#canvas').evaluate(c=>{const ctx=c.getContext('2d'),data=ctx.getImageData(0,0,c.width,c.height).data;let left=c.width,top=c.height,right=-1,bottom=-1;for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){const i=(y*c.width+x)*4;if(Math.abs(data[i]-82)<3&&Math.abs(data[i+1]-183)<3&&Math.abs(data[i+2]-164)<3){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}}const r=c.getBoundingClientRect(),z=Math.min((r.width-50)/1056,(r.height-50)/816),scale=r.width/c.width;return {left:(left*scale-r.width/2)/z+528,right:(right*scale-r.width/2)/z+528,top:(top*scale-r.height/2)/z+408,bottom:(bottom*scale-r.height/2)/z+408};});await page.locator('#save').click();await page.locator('#vector-text').check();await expect(page.locator('#download-svg')).toBeEnabled();const before=await sample();const waiting=page.waitForEvent('download');await page.locator('#download-svg').click();const download=await waiting;const svg=Buffer.concat(await (await download.createReadStream()).toArray()).toString();expect(svg).not.toContain('<text');await loadDrawing(page,svg);await page.keyboard.press('Control+a');const after=await sample();expect(before.right).toBeGreaterThan(before.left);for(const edge of ['left','right','top','bottom'])expect(Math.abs(before[edge]-after[edge])).toBeLessThanOrEqual(3);});

test('offscreen artboard offers return to page without changing the drawing',async({page})=>{await page.goto('/');await loadDrawing(page,'<svg xmlns="http://www.w3.org/2000/svg"><path d="M100 100h100v100h-100z" fill="red"/></svg>');const saved=await page.evaluate(()=>localStorage.getItem('vector-lab'));await expect(page.locator('#return-to-page')).toBeHidden();await page.locator('#canvas').dispatchEvent('wheel',{deltaX:3000,deltaY:0,bubbles:true,cancelable:true});await expect(page.locator('#return-to-page')).toBeVisible();await page.locator('#return-to-page').click();await expect(page.locator('#return-to-page')).toBeHidden();await expect(page.locator('#status')).toHaveText('Page centered');expect(await page.evaluate(()=>localStorage.getItem('vector-lab'))).toBe(saved);await page.locator('#canvas').dispatchEvent('wheel',{deltaX:0,deltaY:-3000,bubbles:true,cancelable:true});await expect(page.locator('#return-to-page')).toBeVisible();await page.locator('#return-to-page').click();await expect(page.locator('#return-to-page')).toBeHidden();});

test('toolbar groups object actions, image crop and page size without redundant sidebar shortcuts',async({page})=>{await page.goto('/');await expect(page.locator('[data-open-panel]')).toHaveCount(0);await expect(page.locator('[data-panel]')).toHaveCount(2);await expect(page.locator('#selection-dimensions')).toBeHidden();await loadDrawing(page,'<svg xmlns="http://www.w3.org/2000/svg"><path d="M100 100h100v100h-100z" fill="red"/></svg>');await page.keyboard.press('Control+a');await expect(page.locator('.context #duplicate')).toBeVisible();await page.locator('#duplicate').click();expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('vector-lab'))[1].children.length)).toBe(2);await page.locator('#delete').click();await page.locator('#page-settings summary').click();await page.locator('#page-width').fill('10');await page.locator('#page-width').press('Enter');await page.locator('#page-settings summary').click();await page.locator('#image-file').setInputFiles(await imageFile(page));await expect(page.locator('.context #image-crop')).toBeVisible();await expect(page.locator('#reset-crop')).toHaveAttribute('aria-label','Reset crop');for(const width of [1024,768,600]){await page.setViewportSize({width,height:768});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}});
test('letter tool shortcuts respect typing and touch holds reveal shortcuts',async({page})=>{await page.goto('/');for(const [key,tool] of Object.entries({s:'select',n:'nodes',t:'text',p:'pen',r:'rectangle',e:'ellipse',d:'dropper',c:'crop',h:'pan'})){await page.keyboard.press(key);await expect(page.locator(`[data-tool="${tool}"]`)).toHaveClass(/active/);await expect(page.locator(`[data-tool="${tool}"]`)).toHaveAttribute('title',new RegExp(key.toUpperCase()));}await page.keyboard.press('t');await page.locator('#text-content').fill('');await page.locator('#text-content').pressSequentially('snprec');await expect(page.locator('[data-tool=text]')).toHaveClass(/active/);await expect(page.locator('#text-content')).toHaveValue('snprec');const pen=page.locator('[data-tool=pen]');await pen.dispatchEvent('pointerdown',{pointerId:99,pointerType:'touch',clientX:30,clientY:200});await expect(page.locator('#shortcut-hint')).toBeVisible();await expect(page.locator('#shortcut-hint')).toHaveText('Pen (P)');await pen.dispatchEvent('pointerup',{pointerId:99,pointerType:'touch'});await pen.dispatchEvent('click');await expect(page.locator('[data-tool=text]')).toHaveClass(/active/);await pen.click();await expect(pen).toHaveClass(/active/);});
test('phone layout keeps canvas usable with scrollable toolbar and accessible drawers',async({page})=>{await page.setViewportSize({width:375,height:667});await page.goto('/');await expect(page.locator('#drawing-tools')).toBeHidden();await expect(page.locator('#object-properties')).toBeHidden();await page.locator('#mobile-tools').click();await expect(page.locator('#drawing-tools')).toBeVisible();await page.locator('[data-tool=rectangle]').click();await expect(page.locator('#drawing-tools')).toBeHidden();const r=await page.locator('#canvas').boundingBox();expect(r.width).toBe(375);expect(r.height).toBeGreaterThan(450);await page.mouse.move(r.x+80,r.y+100);await page.mouse.down();await page.mouse.move(r.x+180,r.y+200,{steps:6});await page.mouse.up();await expect(page.locator('#selection-dimensions')).toBeVisible();const layout=await page.locator('.context').evaluate(el=>({height:el.offsetHeight,scroll:el.scrollWidth,width:el.clientWidth}));expect(layout.height).toBeLessThanOrEqual(64);expect(layout.scroll).toBeGreaterThan(layout.width);await page.locator('#mobile-properties').click();await expect(page.locator('#object-properties')).toBeVisible();await page.locator('[data-panel=align]').click();await expect(page.locator('#panel-align')).toBeVisible();await page.locator('#object-properties .mobile-menu-close').click();await page.locator('#unit-button').click();await expect(page.locator('#unit-menu')).toBeVisible();await page.locator('#unit-menu button').filter({hasText:/^mm$/}).click();await page.locator('#page-settings summary').click();await expect(page.locator('#page-width')).toBeVisible();await page.locator('#page-settings summary').click();for(const size of [{width:320,height:568},{width:390,height:844},{width:667,height:375}]){await page.setViewportSize(size);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);const canvas=await page.locator('#canvas').boundingBox();expect(canvas.width).toBe(size.width);expect(canvas.height).toBeGreaterThan(180);}await page.setViewportSize({width:375,height:667});await page.screenshot({path:'/tmp/vector-lab-phone.png'});});
test('short phone landscape dedicates nearly all height to canvas and keeps file actions accessible',async({page})=>{await page.setViewportSize({width:844,height:390});await page.goto('/');await expect(page.locator('#drawing-tools')).toBeHidden();await expect(page.locator('#object-properties')).toBeHidden();await expect(page.locator('#mobile-file')).toBeVisible();await expect(page.locator('header nav')).toBeHidden();for(const size of [{width:844,height:390},{width:667,height:375},{width:932,height:430},{width:568,height:320}]){await page.setViewportSize(size);const box=await page.locator('#canvas').boundingBox();expect(box.width).toBe(size.width);expect(box.height).toBeGreaterThanOrEqual(size.height-50);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}await page.locator('#mobile-file').click();await expect(page.locator('#save')).toBeVisible();await page.locator('#save').click();await expect(page.locator('#export-dialog')).toBeVisible();await page.locator('#export-dialog button[value=cancel]').click();await page.locator('#mobile-tools').click();await expect(page.locator('#drawing-tools')).toBeVisible();await page.locator('[data-tool=pen]').click();await expect(page.locator('#drawing-tools')).toBeHidden();await page.locator('#unit-button').click();await expect(page.locator('#unit-menu')).toBeVisible();await page.locator('#unit-menu button').filter({hasText:/^mm$/}).click();await page.screenshot({path:'/tmp/vector-lab-landscape.png'});});

test('dimension edits commit outside, cancel explicitly, and survive keyboard viewport resizing',async({page})=>{
  await page.goto('/');
  await loadDrawing(page,'<svg xmlns="http://www.w3.org/2000/svg"><path d="M100 100h200v100h-200z" fill="red"/></svg>');
  await page.keyboard.press('Control+a');
  await page.locator('#units').selectOption('px',{force:true});
  await page.locator('#selection-width-label').click();
  await expect(page.locator('#handle-size')).toBeHidden();
  await page.locator('#selection-width-label').fill('300');
  await page.locator('#unit-button').click();
  await expect(page.locator('#dimension-width')).toHaveValue('300');
  await expect(page.locator('#dimension-height')).toHaveValue('100');
  await page.locator('#unit-button').click();
  await page.locator('#selection-width-label').click();
  await page.locator('#selection-width-label').fill('400');
  await page.getByRole('button',{name:'Cancel width edit',exact:true}).click();
  await expect(page.locator('#dimension-width')).toHaveValue('300');
  await page.locator('#selection-width-label').click();
  await page.locator('#selection-width-label').fill('500');
  await page.locator('#selection-width-label').press('Escape');
  await expect(page.locator('#dimension-width')).toHaveValue('300');
  await page.locator('#selection-height-label').click();
  await page.locator('#selection-height-label').fill('150');
  await page.setViewportSize({width:1024,height:500});
  await expect(page.locator('#handle-size')).toBeHidden();
  await expect(page.locator('#selection-height-label')).toBeFocused();
  await expect(page.locator('#selection-height-label')).toHaveValue('150');
  const editor=await page.locator('#selection-height-label').boundingBox(),stage=await page.locator('#stage').boundingBox();
  expect(editor.y+editor.height).toBeLessThanOrEqual(stage.y+stage.height);
  await page.locator('#selection-height-label').press('Enter');
  await expect(page.locator('#dimension-height')).toHaveValue('150');
  await expect(page.locator('#dimension-width')).toHaveValue('300');
  await page.locator('#selection-width-label').click();
  await page.locator('#selection-width-label').fill('350');
  await page.locator('#canvas').click({position:{x:20,y:20}});
  await page.keyboard.press('Control+a');
  await expect(page.locator('#dimension-width')).toHaveValue('350');
});

test('page dimensions commit individually with enter and blur',async({page})=>{
  await page.goto('/');
  await page.locator('#page-settings summary').click();
  await expect(page.locator('#apply-page-size')).toHaveCount(0);
  await page.locator('#page-width').fill('10');
  await page.locator('#page-width').press('Enter');
  await expect(page.locator('#page-height')).toHaveValue('8.5');
  await page.locator('#page-height').fill('7');
  await page.locator('#page-settings summary').click();
  await page.locator('#page-settings summary').click();
  await expect(page.locator('#page-height')).toHaveValue('7');
  await expect(page.locator('#page-width')).toHaveValue('10');
  await page.locator('#canvas-undo').click();
  await expect(page.locator('#page-height')).toHaveValue('8.5');
  await page.locator('#canvas-redo').click();
  await expect(page.locator('#page-height')).toHaveValue('7');
});

const buildShapes='<svg xmlns="http://www.w3.org/2000/svg"><path d="M100 100h200v100h-200z" fill="red"/><path d="M200 100h200v100h-200z" fill="blue"/></svg>';
async function combineDrawing(page,operation='unite'){
  await page.goto('/');await loadDrawing(page,buildShapes);await page.keyboard.press('Control+a');
  await page.locator('#units').selectOption('px',{force:true});
  await page.locator(`[data-boolean="${operation}"]`).click();
  await expect(page.locator('#break-apart')).toBeEnabled();
}

test('reversible unions export one path and survive transformed SVG reopening and recovery',async({page})=>{
  await combineDrawing(page);
  await page.locator('#dimension-width').fill('600');await page.locator('#dimension-width').press('Enter');
  await page.locator('#dimension-height').fill('200');await page.locator('#dimension-height').press('Enter');
  await page.locator('#position-x').fill('200');await page.locator('#position-y').fill('200');await page.locator('#apply-position').click();
  const output=await svg(page);
  const counts=await page.evaluate(text=>{const doc=new DOMParser().parseFromString(text,'image/svg+xml');return {paths:doc.querySelectorAll('path').length,metadata:doc.querySelectorAll('metadata').length};},output.text);
  expect(counts).toEqual({paths:1,metadata:1});
  await loadDrawing(page,output.text);await page.keyboard.press('Control+a');
  await expect(page.locator('#break-apart')).toBeEnabled();
  await page.reload();await page.keyboard.press('Control+a');
  await page.locator('#break-apart').click();
  await expect(page.locator('#dimension-width')).toHaveValue('600');
  await expect(page.locator('#dimension-height')).toHaveValue('200');
  await expect(page.locator('#position-x')).toHaveValue('200');
  await expect(page.locator('#position-y')).toHaveValue('200');
  const pieces=await svg(page);expect((pieces.text.match(/<path\b/g)||[]).length).toBe(2);
  expect(pieces.text).toContain('fill="#ff0000"');expect(pieces.text).toContain('fill="#0000ff"');
  await page.locator('#canvas-undo').click();await page.keyboard.press('Control+a');await expect(page.locator('#break-apart')).toBeEnabled();
  await page.locator('#canvas-redo').click();await page.keyboard.press('Control+a');await expect(page.locator('#break-apart')).toBeDisabled();
});

test('nested shape building can be broken apart one level at a time after rotation and export',async({page})=>{
  await combineDrawing(page);await page.locator('#duplicate').click();await page.keyboard.press('Control+a');
  await page.locator('[data-boolean=unite]').click();await page.locator('#rotate').click();
  const expected=await Promise.all(['dimension-width','dimension-height','position-x','position-y'].map(id=>page.locator(`#${id}`).inputValue()));
  const output=await svg(page);expect((output.text.match(/<path\b/g)||[]).length).toBe(1);
  await loadDrawing(page,output.text);await page.keyboard.press('Control+a');await page.locator('#break-apart').click();
  expect((await svg(page)).text.match(/<path\b/g)?.length).toBe(2);
  const actual=await Promise.all(['dimension-width','dimension-height','position-x','position-y'].map(id=>page.locator(`#${id}`).inputValue()));
  actual.forEach((value,index)=>expect(Number(value)).toBeCloseTo(Number(expected[index]),2));
  await page.locator('#break-apart').click();expect((await svg(page)).text.match(/<path\b/g)?.length).toBe(4);
});

for(const operation of ['subtract','intersect'])test(`reversible ${operation} exports one cutting path and restores both components`,async({page})=>{
  await combineDrawing(page,operation);const output=await svg(page);
  expect((output.text.match(/<path\b/g)||[]).length).toBe(1);
  await loadDrawing(page,output.text);await page.keyboard.press('Control+a');await page.locator('#break-apart').click();
  expect((await svg(page)).text.match(/<path\b/g)?.length).toBe(2);
});

test('holes and disconnected unions export as subpaths within one path',async({page})=>{
  for(const [operation,shapes] of [
    ['subtract','<path d="M100 100h300v300h-300z"/><path d="M200 200h100v100h-100z"/>'],
    ['unite','<path d="M100 100h100v100h-100z"/><path d="M300 100h100v100h-100z"/>']]){
    await page.goto('/');await loadDrawing(page,`<svg xmlns="http://www.w3.org/2000/svg">${shapes}</svg>`);
    await page.keyboard.press('Control+a');await page.locator(`[data-boolean=${operation}]`).click();
    const output=await svg(page);
    const geometry=await page.evaluate(text=>{const paths=new DOMParser().parseFromString(text,'image/svg+xml').querySelectorAll('path');return {count:paths.length,moves:paths[0].getAttribute('d').match(/m/gi)?.length};},output.text);
    expect(geometry).toEqual({count:1,moves:2});
    await loadDrawing(page,output.text);await page.keyboard.press('Control+a');await page.locator('#break-apart').click();
    expect((await svg(page)).text.match(/<path\b/g)?.length).toBe(2);
  }
});

test('invalid component metadata cannot replace the current drawing',async({page})=>{
  await combineDrawing(page);const output=await svg(page);const before=await page.evaluate(()=>localStorage.getItem('vector-lab'));
  const corrupt=output.text.replace(/"version":1/, '"version":999');
  await page.locator('#file').setInputFiles({name:'invalid.svg',mimeType:'image/svg+xml',buffer:Buffer.from(corrupt)});
  await expect(page.locator('#status')).toContainText('invalid reversible shape data');
  expect(await page.evaluate(()=>localStorage.getItem('vector-lab'))).toBe(before);
});

for(const shape of ['rectangle','ellipse'])test(`${shape} snaps near-equal drawing dimensions and releases for free proportions`,async({page})=>{
  await page.goto('/');await page.locator('#units').selectOption('px',{force:true});
  await page.locator('#snap-button').click();
  for(const id of ['snap-edges','snap-centers','snap-nodes'])await page.locator(`#${id}`).uncheck();
  await page.locator('#snap-button').click();await page.locator(`[data-tool=${shape}]`).click();
  const r=await page.locator('#canvas').boundingBox();
  await page.mouse.move(r.x+150,r.y+150);await page.mouse.down();
  await page.mouse.move(r.x+250,r.y+256);
  await expect(page.locator('#status')).toContainText(shape==='ellipse'?'Circle':'Square');
  expect(Number(await page.locator('#dimension-width').inputValue())).toBeCloseTo(Number(await page.locator('#dimension-height').inputValue()),3);
  await page.mouse.move(r.x+250,r.y+280);await page.mouse.up();
  expect(Number(await page.locator('#dimension-height').inputValue())/Number(await page.locator('#dimension-width').inputValue())).toBeCloseTo(1.3,2);
  await page.locator('#snap-button').click();await page.locator('#snapping').uncheck();await page.locator('#snap-button').click();
  await draw(page,shape,[350,150],[250,256]);
  expect(Number(await page.locator('#dimension-height').inputValue())/Number(await page.locator('#dimension-width').inputValue())).toBeCloseTo(1.06,2);
  await page.locator('#snap-button').click();await page.locator('#snapping').check();await page.locator('#snap-button').click();
  await draw(page,shape,[350,350],[250,244]);
  expect(Number(await page.locator('#dimension-width').inputValue())).toBeCloseTo(Number(await page.locator('#dimension-height').inputValue()),3);
});

for(const {name,start,end,expected} of [
  {name:'outside top left',start:[408,338],end:[528,408],expected:[0,50,0,50]},
  {name:'outside bottom right in reverse',start:[648,478],end:[528,408],expected:[50,0,50,0]},
  {name:'surrounding the image',start:[408,338],end:[648,478],expected:[0,0,0,0]},
  {name:'entirely outside the image',start:[408,338],end:[418,348],expected:[0,0,0,0]}
])test(`crop can start ${name}`,async({page})=>{
  await page.goto('/');
  await page.locator('#image-file').setInputFiles(await imageFile(page));
  await expect(page.locator('#status')).toContainText('Image inserted');
  await page.locator('#start-crop').click();
  await moveProject(page,start,end);
  await page.mouse.up();
  await page.locator('#image-crop summary').click();
  for(const [index,edge] of ['left','right','top','bottom'].entries())
    expect(Number(await page.locator(`#crop-${edge}`).inputValue())).toBeCloseTo(expected[index],1);
});

async function backgroundFixture(page){
  const buffer=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=200;c.height=100;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,200,100);ctx.fillStyle='red';ctx.fillRect(60,20,80,60);ctx.fillStyle='white';ctx.fillRect(90,40,20,20);return c.toDataURL().split(',')[1];});
  await page.locator('#image-file').setInputFiles({name:'background.png',mimeType:'image/png',buffer:Buffer.from(buffer,'base64')});
  await expect(page.locator('#status')).toContainText('Image inserted');
}
async function backgroundClick(page,x,y){const r=await page.locator('#background-canvas').boundingBox();await page.mouse.click(r.x+x/200*r.width,r.y+y/100*r.height);}
async function exportedImagePixels(page){const text=(await svg(page)).text;return page.evaluate(async text=>{const doc=new DOMParser().parseFromString(text,'image/svg+xml'),image=doc.querySelector('image'),img=new Image();img.src=image.getAttribute('href')||image.getAttributeNS('http://www.w3.org/1999/xlink','href');await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);return [[10,10],[20,20],[65,25],[100,50]].map(([x,y])=>[...ctx.getImageData(x,y,1,1).data]);},text);}
test('background removal selects connected colors, protects areas and survives export, undo and recovery',async({page})=>{
  await page.goto('/');await backgroundFixture(page);
  await page.locator('#image-crop summary').click();
  await page.locator('#crop-right').fill('25');await page.locator('#apply-crop').click();
  await page.locator('#rotate').click();
  const geometry=await page.evaluate(()=>{const item=JSON.parse(localStorage.getItem('vector-lab'))[1].children[0][1];return {matrix:item.matrix,crop:item.data.crop,mask:item.children[0]};});
  await page.locator('#remove-background').click();await expect(page.locator('#background-dialog')).toBeVisible();
  await page.locator('#background-size').fill('2');await backgroundClick(page,10,10);
  await expect(page.locator('#background-feedback')).toHaveText('76.0% selected for removal');
  await page.locator('#background-mode').selectOption('keep');await page.locator('#background-size').fill('8');await backgroundClick(page,20,20);
  await page.locator('#background-preview').check();
  expect(await page.locator('#background-canvas').evaluate(c=>[...c.getContext('2d').getImageData(10,10,1,1).data])).toEqual([0,0,0,0]);
  await page.locator('#background-apply').click();await expect(page.locator('#background-dialog')).toBeHidden();
  expect(await page.evaluate(()=>{const item=JSON.parse(localStorage.getItem('vector-lab'))[1].children[0][1];return {matrix:item.matrix,crop:item.data.crop,mask:item.children[0]};})).toEqual(geometry);
  let values=await exportedImagePixels(page);expect(values[0][3]).toBe(0);expect(values[1][3]).toBe(255);expect(values[2]).toEqual([255,0,0,255]);expect(values[3]).toEqual([255,255,255,255]);
  await page.locator('#undo').click();expect((await exportedImagePixels(page))[0][3]).toBe(255);
  await page.locator('#redo').click();await page.reload();expect((await exportedImagePixels(page))[0][3]).toBe(0);
  const output=(await svg(page)).text;await loadDrawing(page,output);expect((await exportedImagePixels(page))[0][3]).toBe(0);
});
test('background modal supports edge selection, selection undo, cancel and mobile layout',async({page})=>{
  await page.goto('/');await expect(page.locator('#remove-background')).toBeHidden();await backgroundFixture(page);
  await page.locator('#remove-background').click();await page.locator('#background-edges').click();await expect(page.locator('#background-feedback')).toHaveText('76.0% selected for removal');
  await page.locator('#background-undo').click();await expect(page.locator('#background-apply')).toBeDisabled();
  await page.locator('#background-mode').selectOption('paint');await backgroundClick(page,100,50);await expect(page.locator('#background-apply')).toBeEnabled();
  await page.locator('#background-clear').click();await expect(page.locator('#background-apply')).toBeDisabled();
  await page.keyboard.press('Delete');await page.keyboard.press('Control+z');await expect(page.locator('#background-dialog')).toBeVisible();
  await page.setViewportSize({width:390,height:844});
  const bounds=await page.locator('#background-dialog').boundingBox();expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(390);
  await page.screenshot({path:'/tmp/drawing-app-background-mobile.png'});
  await page.keyboard.press('Escape');await expect(page.locator('#background-dialog')).toBeHidden();expect((await exportedImagePixels(page))[0][3]).toBe(255);
});

async function drawProjectEllipse(page,from,to){await page.locator('[data-tool="ellipse"]').click();await moveProject(page,from,to);await page.mouse.up();}
async function artPixel(page,x,y){const text=(await svg(page)).text;return page.evaluate(async({text,x,y})=>{const root=new DOMParser().parseFromString(text,'image/svg+xml').documentElement;root.setAttribute('width','1056');root.setAttribute('height','816');const image=new Image();image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(root));await image.decode();const c=document.createElement('canvas');c.width=1056;c.height=816;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(image,0,0);return [...ctx.getImageData(x,y,1,1).data].slice(0,3);},{text,x,y});}
async function addTestCircle(page,radius,imageFirst=true){const text=(await svg(page)).text;const updated=await page.evaluate(({text,radius,imageFirst})=>{const root=new DOMParser().parseFromString(text,'image/svg+xml').documentElement,shape=document.createElementNS(root.namespaceURI,'circle');shape.setAttribute('cx','528');shape.setAttribute('cy','408');shape.setAttribute('r',String(radius));shape.setAttribute('fill','red');if(imageFirst)root.append(shape);else root.prepend(shape);return new XMLSerializer().serializeToString(root);},{text,radius,imageFirst});await loadDrawing(page,updated);}

for(const imageFirst of [true,false])test(`image intersection keeps the circle interior with image ${imageFirst?'below':'above'} the shape`,async({page})=>{
  await page.goto('/');await page.locator('#snap-button').click();await page.locator('#snapping').uncheck();await page.locator('#snap-button').click();
  await page.locator('#image-file').setInputFiles(await imageFile(page));await expect(page.locator('#status')).toContainText('Image inserted');await page.locator('#rotate').click();
  await addTestCircle(page,20,imageFirst);
  await page.keyboard.press('Control+a');await (await panelLocator(page,'[data-boolean="intersect"]')).click();
  await expect(page.locator('#status')).toHaveText('Image clipped to shape. Undo restores both.');
  expect(await artPixel(page,538,408)).toEqual([0,0,255]);expect(await artPixel(page,568,408)).toEqual([255,255,255]);expect(await artPixel(page,545,425)).toEqual([255,255,255]);
  let output=(await svg(page)).text;expect(output).toContain('intersections');expect((output.match(/<image/g)||[]).length).toBe(1);
  await page.locator('#undo').click();expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('vector-lab'))[1].children.length)).toBe(2);
  await page.locator('#redo').click();await page.reload();expect(await artPixel(page,568,408)).toEqual([255,255,255]);
  output=(await svg(page)).text;await loadDrawing(page,output);await page.keyboard.press('Control+a');
  await page.locator('#image-crop summary').click();await page.locator('#crop-right').fill('25');await page.locator('#apply-crop').click();await page.locator('#reset-crop').click();
  expect(await artPixel(page,538,408)).toEqual([0,0,255]);expect(await artPixel(page,568,408)).toEqual([255,255,255]);
  await page.locator('#image-crop summary').click();
  await addTestCircle(page,5);await page.keyboard.press('Control+a');await (await panelLocator(page,'[data-boolean="subtract"]')).click();
  await page.locator('#image-crop summary').click();await page.locator('#reset-crop').click();
  expect(await artPixel(page,528,408)).toEqual([255,255,255]);expect(await artPixel(page,538,408)).toEqual([0,0,255]);expect(await artPixel(page,568,408)).toEqual([255,255,255]);
});
test('image intersection without overlap keeps both originals',async({page})=>{
  await page.goto('/');await page.locator('#image-file').setInputFiles(await imageFile(page));await expect(page.locator('#status')).toContainText('Image inserted');
  await drawProjectEllipse(page,[100,100],[140,140]);await page.keyboard.press('Control+a');
  const before=await page.evaluate(()=>localStorage.getItem('vector-lab'));
  await (await panelLocator(page,'[data-boolean="intersect"]')).click();await expect(page.locator('#status')).toContainText('does not overlap');
  expect(await page.evaluate(()=>localStorage.getItem('vector-lab'))).toBe(before);
});

async function traceFixture(page,kind='hole'){
  const buffer=await page.evaluate(kind=>{const c=document.createElement('canvas');c.width=160;c.height=kind==='complex'?160:100;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='black';
    if(kind==='complex'){for(let y=2;y<158;y+=10)for(let x=2;x<158;x+=10)ctx.fillRect(x,y,4,4);}
    else if(kind==='colors'){ctx.fillStyle='red';ctx.fillRect(10,10,60,80);ctx.fillStyle='blue';ctx.fillRect(90,10,60,80);}
    else{ctx.fillRect(20,10,120,80);ctx.fillStyle='white';ctx.fillRect(60,35,40,30);ctx.fillStyle='black';ctx.fillRect(4,4,1,1);}
    return c.toDataURL().split(',')[1];},kind);
  await page.locator('#image-file').setInputFiles({name:'trace.png',mimeType:'image/png',buffer:Buffer.from(buffer,'base64')});await expect(page.locator('#status')).toContainText('Image inserted');
}
async function traceReady(page){await expect(page.locator('#trace-result')).toHaveAttribute('aria-busy','false');}
async function svgSampleGrid(page,text){return page.evaluate(async text=>{const root=new DOMParser().parseFromString(text,'image/svg+xml').documentElement;root.setAttribute('width','1056');root.setAttribute('height','816');const image=new Image();image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(root));await image.decode();const c=document.createElement('canvas');c.width=1056;c.height=816;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(image,0,0);const result=[];for(let y=343;y<478;y+=7)for(let x=438;x<618;x+=7){const p=ctx.getImageData(x,y,1,1).data;result.push(p[0]<128);}return result;},text);}
test('image tracing defaults to simple editable paths, preserves holes, and supports undo and SVG recovery',async({page})=>{
  await page.goto('/');await expect(page.locator('#trace-image')).toBeHidden();await traceFixture(page);
  await page.locator('#trace-image').click();await traceReady(page);await expect(page.locator('#trace-mode')).toHaveValue('mono');await expect(page.locator('#trace-preset')).toHaveValue('simple');await expect(page.locator('#trace-status')).toContainText('8 nodes');
  await page.screenshot({path:'/tmp/drawing-app-trace-desktop.png'});
  await page.locator('#trace-apply').click();await expect(page.locator('#trace-dialog')).toBeHidden();await expect(page.locator('#status')).toContainText('editable path');
  let output=(await svg(page)).text;expect(output).not.toMatch(/<image|<clipPath/);expect(output).toContain('<path');
  expect(await artPixel(page,478,378)).toEqual([0,0,0]);expect(await artPixel(page,528,408)).toEqual([255,255,255]);expect(await artPixel(page,458,363)).toEqual([255,255,255]);
  await page.locator('[data-tool="nodes"]').click();await page.keyboard.press('Control+a');await expect(page.locator('#node-count')).toHaveText('8 nodes selected');
  await page.locator('#undo').click();expect((await svg(page)).text).toContain('<image');await page.locator('#redo').click();await page.reload();
  output=(await svg(page)).text;expect(output).not.toContain('<image');await loadDrawing(page,output);expect(await artPixel(page,528,408)).toEqual([255,255,255]);expect(await artPixel(page,478,378)).toEqual([0,0,0]);
});
test('image tracing respects cropping and rotation and bakes them into plain paths',async({page})=>{
  await page.goto('/');await traceFixture(page);await page.locator('#image-crop summary').click();await page.locator('#crop-right').fill('25');await page.locator('#apply-crop').click();await page.locator('#rotate').click();
  const before=(await svg(page)).text,samples=await svgSampleGrid(page,before);
  await page.locator('#trace-image').click();await traceReady(page);await page.locator('#trace-apply').click();const after=(await svg(page)).text;
  expect(after).not.toMatch(/<image|<clipPath/);const traced=await svgSampleGrid(page,after);expect(traced.filter((value,i)=>value===samples[i]).length/samples.length).toBeGreaterThan(.98);
});
test('image tracing offers limited colors, threshold, inversion and reset with fresh previews',async({page})=>{
  await page.goto('/');await traceFixture(page,'colors');await page.locator('#trace-image').click();await traceReady(page);
  await page.locator('#trace-threshold').fill('1');await traceReady(page);await expect(page.locator('#trace-apply')).toBeDisabled();await expect(page.locator('#trace-status')).toContainText('Nothing to trace');
  await page.locator('#trace-invert').check();await traceReady(page);await expect(page.locator('#trace-apply')).toBeEnabled();
  await page.locator('#trace-mode').selectOption('color');await page.locator('#trace-colors').selectOption('2');await traceReady(page);
  await expect(page.locator('#trace-threshold-control')).toBeHidden();await expect(page.locator('#trace-status')).toContainText('2 colors');
  expect(await page.locator('#trace-result path').evaluateAll(paths=>paths.map(p=>p.getAttribute('fill')).sort())).toEqual(['#0000ff','#ff0000']);
  await page.locator('#trace-reset').click();await traceReady(page);await expect(page.locator('#trace-mode')).toHaveValue('mono');await expect(page.locator('#trace-invert')).not.toBeChecked();
  await page.locator('#trace-mode').selectOption('color');await page.locator('#trace-colors').selectOption('2');await traceReady(page);await page.locator('#trace-apply').click();
  const output=(await svg(page)).text;expect(output).not.toContain('<image');expect(output).toContain('fill="#ff0000"');expect(output).toContain('fill="#0000ff"');
  expect(await artPixel(page,478,408)).toEqual([255,0,0]);expect(await artPixel(page,578,408)).toEqual([0,0,255]);
});
test('image tracing enforces complexity limits and cancel leaves the image unchanged on mobile',async({page})=>{
  await page.goto('/');await traceFixture(page,'complex');const before=await page.evaluate(()=>localStorage.getItem('vector-lab'));
  await page.locator('#trace-image').click();await traceReady(page);await expect(page.locator('#trace-status')).toContainText('Too complex');await expect(page.locator('#trace-apply')).toBeDisabled();
  await page.locator('#trace-preset').selectOption('detailed');await traceReady(page);await expect(page.locator('#trace-apply')).toBeEnabled();
  await page.setViewportSize({width:390,height:844});const bounds=await page.locator('#trace-dialog').boundingBox();expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(390);
  expect(await page.locator('#trace-dialog').evaluate(d=>d.scrollWidth<=d.clientWidth)).toBe(true);await page.screenshot({path:'/tmp/drawing-app-trace-mobile.png'});
  await page.keyboard.press('Escape');await expect(page.locator('#trace-dialog')).toBeHidden();expect(await page.evaluate(()=>localStorage.getItem('vector-lab'))).toBe(before);
  await page.locator('#trace-image').click();await page.locator('#trace-cancel').click();await expect(page.locator('#trace-dialog')).toBeHidden();expect(await page.evaluate(()=>localStorage.getItem('vector-lab'))).toBe(before);
});
test('image tracing uses background transparency and shape intersection as real geometry',async({page})=>{
  await page.goto('/');await page.locator('#image-file').setInputFiles(await imageFile(page));await expect(page.locator('#status')).toContainText('Image inserted');
  await page.locator('#remove-background').click();await page.locator('#background-size').fill('2');await backgroundClick(page,20,50);await page.locator('#background-apply').click();
  await addTestCircle(page,20);await page.keyboard.press('Control+a');await (await panelLocator(page,'[data-boolean="intersect"]')).click();
  await page.locator('#trace-image').click();await traceReady(page);await page.locator('#trace-apply').click();const output=(await svg(page)).text;expect(output).not.toMatch(/<image|<clipPath/);
  expect(await artPixel(page,538,408)).toEqual([0,0,0]);expect(await artPixel(page,518,408)).toEqual([255,255,255]);expect(await artPixel(page,568,408)).toEqual([255,255,255]);
});

async function refinementPoint(page,x,y,surface='original'){
  const target=page.locator(surface==='original'?'#trace-original':'#trace-result svg');await target.evaluate(el=>el.scrollIntoView({block:'center'}));const r=await target.boundingBox();return {x:r.x+x/160*r.width,y:r.y+y/100*r.height};
}
async function paintTrace(page,x,y,surface='original',end=null){const p=await refinementPoint(page,x,y,surface);await page.mouse.move(p.x,p.y);await page.mouse.down();if(end){const q=await refinementPoint(page,...end,surface);await page.mouse.move(q.x,q.y,{steps:5});}await page.mouse.up();await traceReady(page);}
async function traceContains(page,x,y){return page.locator('#trace-result svg').evaluate((svg,{x,y})=>{const [,,w,h]=svg.getAttribute('viewBox').split(' ').map(Number),ctx=document.createElement('canvas').getContext('2d');return [...svg.querySelectorAll('path')].some(path=>ctx.isPointInPath(new Path2D(path.getAttribute('d')),x/160*w,y/100*h,'nonzero'));},{x,y});}
test('trace hole filling restores the silhouette without raising threshold',async({page})=>{
  await page.goto('/');await traceFixture(page);await page.locator('#trace-image').click();await traceReady(page);expect(await traceContains(page,80,50)).toBe(false);
  await page.locator('#trace-holes').check();await traceReady(page);await expect(page.locator('#trace-threshold')).toHaveValue('128');await expect(page.locator('#trace-status')).toContainText('enclosed holes filled');expect(await traceContains(page,80,50)).toBe(true);expect(await traceContains(page,150,50)).toBe(false);
  await page.locator('#trace-holes').uncheck();await traceReady(page);expect(await traceContains(page,80,50)).toBe(false);
});
test('include and exclude trace brushes survive retracing and export with edit undo',async({page})=>{
  await page.goto('/');await traceFixture(page);await page.locator('#trace-image').click();await traceReady(page);
  await page.locator('#trace-brush-mode').selectOption('include');await page.locator('#trace-brush-size').fill('20');await paintTrace(page,80,50,'result');expect(await traceContains(page,80,50)).toBe(true);
  await page.locator('#trace-preset').selectOption('detailed');await page.locator('#trace-threshold').fill('200');await traceReady(page);expect(await traceContains(page,80,50)).toBe(true);
  await page.locator('#trace-brush-mode').selectOption('exclude');await paintTrace(page,40,50,'original',[40,65]);expect(await traceContains(page,40,50)).toBe(false);expect(await traceContains(page,40,60)).toBe(false);
  await page.locator('#trace-holes').check();await traceReady(page);expect(await traceContains(page,40,50)).toBe(false);expect(await traceContains(page,80,50)).toBe(true);
  await page.locator('#trace-edit-undo').click();await traceReady(page);expect(await traceContains(page,40,50)).toBe(true);
  await paintTrace(page,40,50);await page.screenshot({path:'/tmp/drawing-app-trace-refinement.png'});await page.locator('#trace-apply').click();
  expect(await artPixel(page,528,408)).toEqual([0,0,0]);expect(await artPixel(page,488,408)).toEqual([255,255,255]);
  await page.locator('#undo').click();expect((await svg(page)).text).toContain('<image');
});
test('spot removal deletes only a disconnected artifact and erased marks restore automatic tracing',async({page})=>{
  await page.goto('/');await traceFixture(page,'colors');await page.locator('#trace-image').click();await traceReady(page);await page.locator('#trace-brush-mode').selectOption('spot');await paintTrace(page,120,50);
  expect(await traceContains(page,120,50)).toBe(false);expect(await traceContains(page,40,50)).toBe(true);
  await page.locator('#trace-threshold').fill('255');await traceReady(page);expect(await traceContains(page,120,50)).toBe(false);
  await page.locator('#trace-edit-clear').click();await traceReady(page);expect(await traceContains(page,120,50)).toBe(true);
  await page.locator('#trace-edit-undo').click();await traceReady(page);expect(await traceContains(page,120,50)).toBe(false);
  await page.locator('#trace-brush-mode').selectOption('erase');await paintTrace(page,120,50);expect(await traceContains(page,120,50)).toBe(true);
});
test('touch trace corrections support cancellation and leave the source unchanged when closing',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');await traceFixture(page);const before=await page.evaluate(()=>localStorage.getItem('vector-lab'));await page.locator('#trace-image').click();await traceReady(page);
  await page.locator('#trace-brush-mode').selectOption('include');const p=await refinementPoint(page,80,50),cdp=await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await traceReady(page);expect(await traceContains(page,80,50)).toBe(false);await expect(page.locator('#trace-edit-undo')).toBeDisabled();
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await traceReady(page);expect(await traceContains(page,80,50)).toBe(true);
  await page.screenshot({path:'/tmp/drawing-app-trace-refinement-mobile.png'});await page.locator('#trace-cancel').click();expect(await page.evaluate(()=>localStorage.getItem('vector-lab'))).toBe(before);
});

test('flat color artwork exports smooth curves with shared boundaries and preserved corners',async({page})=>{
  await page.goto('/');
  const buffer=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=320;c.height=240;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,320,240);ctx.fillStyle='#ff0000';ctx.fillRect(10,10,300,220);ctx.fillStyle='#0000ff';ctx.beginPath();ctx.moveTo(160,10);ctx.bezierCurveTo(250,60,90,180,160,230);ctx.lineTo(310,230);ctx.lineTo(310,10);ctx.closePath();ctx.fill();for(const [x,y,color] of [[65,65,'#00ff00'],[245,175,'#ffff00'],[235,65,'#800080']]){ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,24,0,Math.PI*2);ctx.fill();}return c.toDataURL().split(',')[1];});
  await page.locator('#image-file').setInputFiles({name:'flat-art.png',mimeType:'image/png',buffer:Buffer.from(buffer,'base64')});await expect(page.locator('#status')).toContainText('Image inserted');await page.locator('#trace-image').click();
  await page.locator('#trace-mode').selectOption('color');await page.locator('#trace-colors').selectOption('8');await page.locator('#trace-preset').selectOption('detailed');await page.locator('#trace-smoothing').fill('0');await traceReady(page);
  const rough=await page.locator('#trace-status').textContent();const roughNodes=Number(rough.match(/[\d,]+/)[0].replaceAll(',',''));
  await page.locator('#trace-smoothing').fill('70');await traceReady(page);const smooth=await page.locator('#trace-status').textContent();const smoothNodes=Number(smooth.match(/[\d,]+/)[0].replaceAll(',',''));expect(smoothNodes).toBeLessThan(roughNodes);expect(await page.locator('#trace-result path').evaluateAll(paths=>paths.map(p=>p.getAttribute('fill')).sort())).toEqual(['#0000ff','#00ff00','#800080','#ff0000','#ffff00']);
  const paths=await page.locator('#trace-result path').evaluateAll(paths=>paths.map(p=>p.getAttribute('d')));expect(paths.some(d=>d.includes('C'))).toBe(true);
  // Every interior sample remains covered, including the curved red/blue seam.
  expect(await page.locator('#trace-result svg').evaluate(svg=>{const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d'),[,,w,h]=svg.getAttribute('viewBox').split(' ').map(Number),paths=[...svg.querySelectorAll('path')].map(p=>new Path2D(p.getAttribute('d')));for(let y=20;y<220;y+=2)for(let x=20;x<300;x+=2)if(!paths.some(p=>ctx.isPointInPath(p,x/320*w,y/240*h)))return [x,y];return [];})).toEqual([]);
  await page.screenshot({path:'/tmp/drawing-app-smooth-color-trace.png'});await page.locator('#trace-apply').click();const output=(await svg(page)).text;expect(output).not.toMatch(/<image|<clipPath/);expect(output).toMatch(/[cC]/);
  const handles=await page.evaluate(()=>{const art=JSON.parse(localStorage.getItem('vector-lab'))[1],paths=art.children.flatMap(([,item])=>item.children?item.children.map(([,child])=>child):[item]);return paths.flatMap(p=>p.segments||[]).filter(segment=>Array.isArray(segment[0])&&segment.slice(1).some(handle=>handle.some(Boolean))).length;});expect(handles).toBeGreaterThan(0);
});

async function svgColorGrid(page,text){return page.evaluate(async text=>{const root=new DOMParser().parseFromString(text,'image/svg+xml').documentElement;root.setAttribute('width','1056');root.setAttribute('height','816');const image=new Image();image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(root));await image.decode();const canvas=document.createElement('canvas');canvas.width=1056;canvas.height=816;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,1056,816);ctx.drawImage(image,0,0);const values=[];for(let y=300;y<500;y+=7)for(let x=330;x<700;x+=7)values.push(...ctx.getImageData(x,y,1,1).data);return values;},text);}
async function savedObjects(page){return page.evaluate(()=>JSON.parse(localStorage.getItem('vector-lab'))[1].children);}
const groupingDrawing='<svg xmlns="http://www.w3.org/2000/svg"><path d="M440 360h50v60h-50z" fill="red"/><path d="M550 400h40v30h-40z" fill="blue"/></svg>';
test('group toolbar and keyboard shortcuts preserve appearance through transforms, ungroup and undo',async({page})=>{
  await page.goto('/');await loadDrawing(page,groupingDrawing);await page.keyboard.press('Control+a');await expect(page.locator('.context #group-objects')).toBeEnabled();await expect(page.locator('#ungroup-objects')).toBeDisabled();
  const before=await svgColorGrid(page,(await svg(page)).text);await page.keyboard.press('Control+g');let items=await savedObjects(page);expect(items).toHaveLength(1);expect(items[0][0]).toBe('Group');expect(items[0][1].children).toHaveLength(2);await expect(page.locator('#group-objects')).toBeDisabled();await expect(page.locator('#ungroup-objects')).toBeEnabled();
  expect(await svgColorGrid(page,(await svg(page)).text)).toEqual(before);
  await page.locator('#canvas').focus();await page.keyboard.press('ArrowRight');await page.locator('#rotate').click();await page.locator('#dimension-width').fill('2');await page.locator('#dimension-width').press('Enter');
  const transformed=await svgColorGrid(page,(await svg(page)).text);await page.keyboard.press('Control+Shift+g');expect(await savedObjects(page)).toHaveLength(2);
  const restored=await svgColorGrid(page,(await svg(page)).text);expect(Math.max(...restored.map((v,i)=>Math.abs(v-transformed[i])))).toBeLessThanOrEqual(2);
  await page.locator('#undo').click();expect(await savedObjects(page)).toHaveLength(1);await page.locator('#redo').click();expect(await savedObjects(page)).toHaveLength(2);
});
test('nested groups survive recovery, SVG reopening, duplication and Command shortcuts',async({page})=>{
  await page.goto('/');await loadDrawing(page,groupingDrawing);await page.keyboard.press('Control+a');await page.locator('#group-objects').click();await page.locator('#duplicate').click();await page.keyboard.press('Control+a');await page.keyboard.press('Meta+g');
  let items=await savedObjects(page);expect(items).toHaveLength(1);expect(items[0][1].children.map(child=>child[0])).toEqual(['Group','Group']);
  await page.reload();items=await savedObjects(page);expect(items[0][1].data.objectGroup).toBe(true);const output=(await svg(page)).text;await loadDrawing(page,output);items=await savedObjects(page);expect(items).toHaveLength(1);expect(items[0][1].children).toHaveLength(2);
  await page.keyboard.press('Control+a');await page.keyboard.press('Meta+Shift+g');items=await savedObjects(page);expect(items).toHaveLength(2);expect(items.map(item=>item[0])).toEqual(['Group','Group']);
  await page.locator('#ungroup-objects').click();expect(await savedObjects(page)).toHaveLength(4);
});
test('groups preserve image crops and reversible shapes through transformed SVG export',async({page})=>{
  await page.goto('/');await loadDrawing(page,'<svg xmlns="http://www.w3.org/2000/svg"><path d="M380 350h80v80h-80z" fill="red"/><path d="M420 370h80v80h-80z" fill="blue"/></svg>');await page.keyboard.press('Control+a');await (await panelLocator(page,'[data-boolean="unite"]')).click();
  await page.locator('#image-file').setInputFiles(await imageFile(page));await expect(page.locator('#status')).toContainText('Image inserted');await page.locator('#image-crop summary').click();await page.locator('#crop-left').fill('25');await page.locator('#apply-crop').click();
  await page.keyboard.press('Control+a');await page.locator('#group-objects').click();await page.locator('#rotate').click();const output=(await svg(page)).text;expect(output).toContain('vector-lab-shape-building');const before=await svgColorGrid(page,output);
  await loadDrawing(page,output);const after=await svgColorGrid(page,(await svg(page)).text);expect(Math.max(...after.map((v,i)=>Math.abs(v-before[i])))).toBeLessThanOrEqual(2);
  await page.keyboard.press('Control+a');await page.locator('#ungroup-objects').click();const items=await savedObjects(page);expect(items).toHaveLength(2);expect(items.some(([,item])=>item.data?.shapeBuild)).toBe(true);expect(items.find(([,item])=>item.data?.image)[1].data.crop.left).toBe(25);
  await expect(page.locator('#break-apart')).toBeEnabled();await page.locator('#break-apart').click();expect(await savedObjects(page)).toHaveLength(3);expect((await svg(page)).text).toContain('<image');
  await page.locator('[data-tool=select]').click();let p=await projectPoint(page,900,700);await page.mouse.click(p.x,p.y);await page.locator('#fit').click();p=await projectPoint(page,528,408);await page.mouse.click(p.x,p.y);await expect(page.locator('#image-crop')).toBeVisible();await expect(page.locator('#ungroup-objects')).toBeDisabled();
});
test('grouping shortcuts respect text fields and open dialogs',async({page})=>{
  await page.goto('/');await loadDrawing(page,groupingDrawing);await page.keyboard.press('Control+a');await page.locator('#position-x').focus();await page.keyboard.press('Control+g');expect(await savedObjects(page)).toHaveLength(2);
  await page.locator('#save').click();await page.keyboard.press('Control+g');expect(await savedObjects(page)).toHaveLength(2);await page.keyboard.press('Escape');await page.locator('#canvas').focus();await page.keyboard.press('Control+g');expect(await savedObjects(page)).toHaveLength(1);
});

const transformedNodeDrawing=compound=>`<svg xmlns="http://www.w3.org/2000/svg"><g data-paper-data='{"objectGroup":true}' transform="matrix(1.2 .4 -.2 .9 40 -80)"><path d="${compound?'M440 350h80v80h-80z M460 370v40h40v-40z':'M440 350C470 350 500 380 500 410L440 410Z'}" fill="red"/><path d="M570 370h30v30h-30z" fill="blue"/></g></svg>`;
async function settleCanvas(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function prepareZoomedNodes(page,compound=false){
  await page.goto('/');await loadDrawing(page,transformedNodeDrawing(compound));await page.keyboard.press('Control+a');await page.locator('#ungroup-objects').click();
  await page.locator('#snap-button').click();await page.locator('#snapping').uncheck();await page.locator('#snap-button').click();
  let p=await projectPoint(page,900,700);await page.mouse.click(p.x,p.y);await page.locator('#fit').click();p=await projectPoint(page,compound?508:528,compound?424:445);await page.mouse.click(p.x,p.y);
  await page.locator('[data-tool=nodes]').click();await page.locator('#fit').click();await settleCanvas(page);const r=await page.locator('#canvas').boundingBox(),base=Math.min((r.width-50)/1056,(r.height-50)/816);
  for(let i=0;i<4;i++)await page.locator('#zoom-in').click();await settleCanvas(page);return base*1.25**4;
}
async function zoomedNodePoint(page,x,y,zoom,shift=[0,0]){const r=await page.locator('#canvas').boundingBox();return {x:r.x+r.width/2+(x-528)*zoom+shift[0],y:r.y+r.height/2+(y-408)*zoom+shift[1]};}
async function firstNodeWorld(page,key='point'){return page.evaluate(key=>{const children=JSON.parse(localStorage.getItem('vector-lab'))[1].children;function find([type,item],parent){const matrix=parent.multiply(new DOMMatrix(item.matrix||[1,0,0,1,0,0]));if(type==='Path'){const s=item.segments[0],p=Array.isArray(s[0])?s[0]:s,h=key==='point'?[0,0]:s[key==='handleIn'?1:2]||[0,0],v=new DOMPoint(p[0]+h[0],p[1]+h[1]).matrixTransform(matrix);return {x:v.x,y:v.y};}for(const child of item.children||[]){const value=find(child,matrix);if(value)return value;}}return find(children[0],new DOMMatrix());},key);}
async function blueCameraLandmark(page){await settleCanvas(page);return page.locator('#canvas').evaluate(c=>{const ctx=c.getContext('2d'),{data}=ctx.getImageData(0,0,c.width,c.height),r=c.getBoundingClientRect(),scale=c.width/r.width;let left=c.width,top=c.height,right=-1,bottom=-1;for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){const i=(y*c.width+x)*4;if(data[i]<30&&data[i+1]<30&&data[i+2]>220){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}}return {width:(right-left)/scale,height:(bottom-top)/scale,x:((left+right)/2-c.width/2)/scale,y:((top+bottom)/2-c.height/2)/scale};});}
for(const deviceScaleFactor of [1,2])test.describe(`zoomed node editing at pixel ratio ${deviceScaleFactor}`,()=>{
  test.use({deviceScaleFactor});
  test('transformed anchors align with the shape and Undo preserves zoom and pan',async({page})=>{
    const zoom=await prepareZoomedNodes(page),original=await firstNodeWorld(page);expect(original.x).toBeCloseTo(498,4);expect(original.y).toBeCloseTo(411,4);
    await page.locator('[data-tool=pan]').click();let r=await page.locator('#canvas').boundingBox();await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();await page.mouse.move(r.x+r.width/2+30,r.y+r.height/2-20,{steps:4});await page.mouse.up();await page.locator('[data-tool=nodes]').click();await settleCanvas(page);
    const p=await zoomedNodePoint(page,498,411,zoom,[30,-20]);
    const border=await page.locator('#canvas').evaluate((c,p)=>{const r=c.getBoundingClientRect(),scale=c.width/r.width,{data}=c.getContext('2d').getImageData(Math.round((p.x-r.x-6)*scale),Math.round((p.y-r.y-6)*scale),Math.round(12*scale),Math.round(12*scale));let count=0;for(let i=0;i<data.length;i+=4)if(data[i]<70&&data[i+1]>80&&data[i+1]<170&&data[i+2]>80&&data[i+2]<170)count++;return count;},p);expect(border).toBeGreaterThan(10);
    const camera=await blueCameraLandmark(page);await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+20,p.y+12,{steps:5});await page.mouse.up();await expect(page.locator('#node-count')).toHaveText('1 node selected');const changed=await firstNodeWorld(page);expect(changed.x).toBeCloseTo(original.x+20/zoom,3);expect(changed.y).toBeCloseTo(original.y+12/zoom,3);
    await page.keyboard.press('Control+z');await settleCanvas(page);let current=await blueCameraLandmark(page);for(const key of ['width','height','x','y'])expect(Math.abs(current[key]-camera[key])).toBeLessThanOrEqual(1.5);expect((await firstNodeWorld(page)).x).toBeCloseTo(original.x,4);
    await page.keyboard.press('Control+Shift+z');await settleCanvas(page);current=await blueCameraLandmark(page);for(const key of ['width','height','x','y'])expect(Math.abs(current[key]-camera[key])).toBeLessThanOrEqual(1.5);expect((await firstNodeWorld(page)).x).toBeCloseTo(changed.x,4);
    await page.locator('#fit').click();expect((await blueCameraLandmark(page)).width).toBeLessThan(camera.width*.65);
  });
});
test('zoomed transformed curve handles follow the pointer in project coordinates',async({page})=>{
  const zoom=await prepareZoomedNodes(page),anchor=await firstNodeWorld(page),handle=await firstNodeWorld(page,'handleOut'),p=await zoomedNodePoint(page,handle.x,handle.y,zoom);
  await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+18,p.y-11,{steps:5});await page.mouse.up();const changed=await firstNodeWorld(page,'handleOut');expect(changed.x).toBeCloseTo(handle.x+18/zoom,3);expect(changed.y).toBeCloseTo(handle.y-11/zoom,3);expect(await firstNodeWorld(page)).toEqual(anchor);
});
test('transformed compound nodes use project coordinates for marquee and arrow nudges',async({page})=>{
  const zoom=await prepareZoomedNodes(page,true),before=await firstNodeWorld(page),a=await zoomedNodePoint(page,before.x-20,before.y-20,zoom),b=await zoomedNodePoint(page,before.x+15,before.y+15,zoom);
  await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:5});await page.mouse.up();await expect(page.locator('#node-count')).toHaveText('1 node selected');
  await page.keyboard.press('ArrowRight');const moved=await firstNodeWorld(page);expect(moved.x).toBeCloseTo(before.x+12,4);expect(moved.y).toBeCloseTo(before.y,4);
});

test('keyboard zoom anchors to the cursor and falls back to the canvas center',async({page})=>{
  await page.goto('/');
  await loadDrawing(page,'<svg xmlns="http://www.w3.org/2000/svg" width="1056" height="816"><rect x="650" y="450" width="80" height="60" fill="#0000ff"/></svg>');
  const r=await page.locator('#canvas').boundingBox(),before=await blueCameraLandmark(page);
  await page.mouse.move(r.x+r.width/2+before.x,r.y+r.height/2+before.y);
  for(const key of ['=','+','-']){
    const old=await blueCameraLandmark(page);await page.keyboard.press(key);const current=await blueCameraLandmark(page);
    expect(Math.abs(current.x-before.x)).toBeLessThanOrEqual(1.5);expect(Math.abs(current.y-before.y)).toBeLessThanOrEqual(1.5);
    expect(current.width/old.width).toBeCloseTo(key==='-'?.8:1.25,1);
  }
  // A different cursor location becomes the new anchor.
  const old=await blueCameraLandmark(page),offset={x:-70,y:-40};
  await page.mouse.move(r.x+r.width/2+offset.x,r.y+r.height/2+offset.y);await page.keyboard.press('=');
  let current=await blueCameraLandmark(page);
  expect(Math.abs(current.x-(offset.x+(old.x-offset.x)*1.25))).toBeLessThanOrEqual(1.5);
  expect(Math.abs(current.y-(offset.y+(old.y-offset.y)*1.25))).toBeLessThanOrEqual(1.5);
  await page.mouse.move(1,1);const outside=await blueCameraLandmark(page);await page.keyboard.press('-');current=await blueCameraLandmark(page);
  expect(Math.abs(current.x-outside.x*.8)).toBeLessThanOrEqual(1.5);expect(Math.abs(current.y-outside.y*.8)).toBeLessThanOrEqual(1.5);
});

async function bucketColor(page,color){await page.locator('#fill').evaluate((el,color)=>{el.setColor(color,1);el.dispatchEvent(new Event('change'));},color);}
test('paint bucket creates an independent exact curved path with a hole and supports undo and export',async({page})=>{
  await page.goto('/');await loadDrawing(page,'<svg xmlns="http://www.w3.org/2000/svg" width="1056" height="816"><circle cx="450" cy="400" r="180" fill="none" stroke="black"/><circle cx="450" cy="400" r="60" fill="none" stroke="black"/></svg>');
  await page.keyboard.press('b');await expect(page.locator('[data-tool=bucket]')).toHaveClass(/active/);await bucketColor(page,'#ff0000');
  const p=await projectPoint(page,560,400);await page.mouse.click(p.x,p.y);await expect(page.locator('#status')).toContainText('new path');
  await settleCanvas(page);await page.screenshot({path:'/tmp/vector-lab-bucket.png'});
  let output=await svg(page);expect(output.text).toContain('#ff0000');expect(output.text.match(/stroke="#000000"/g)).toHaveLength(2);
  const fill=await page.evaluate(()=>JSON.parse(localStorage.getItem('vector-lab'))[1].children.at(-1));expect(fill[0]).toBe('CompoundPath');expect(fill[1].children).toHaveLength(2);
  await page.keyboard.press('Control+z');expect((await svg(page)).text).not.toContain('#ff0000');await page.keyboard.press('Control+Shift+z');expect((await svg(page)).text).toContain('#ff0000');
  await page.keyboard.press('b');await bucketColor(page,'#0000ff');const q=await projectPoint(page,450,400);await page.mouse.click(q.x,q.y);await expect(page.locator('#status')).toContainText('new path');
  output=await svg(page);expect(output.text).toContain('#ff0000');expect(output.text).toContain('#0000ff');
});
test('paint bucket fills the clicked overlap only and rejects unbounded space',async({page})=>{
  await page.goto('/');await loadDrawing(page,'<svg xmlns="http://www.w3.org/2000/svg" width="1056" height="816"><path d="M200 200h250v250h-250z" fill="none" stroke="black"/><path d="M350 300h250v250h-250z" fill="none" stroke="black"/></svg>');
  await page.keyboard.press('b');await bucketColor(page,'#ff0000');let p=await projectPoint(page,400,350);await page.mouse.click(p.x,p.y);await expect(page.locator('#status')).toContainText('new path');
  const record=await page.evaluate(()=>JSON.parse(localStorage.getItem('vector-lab'))[1].children.at(-1));expect(record[0]).toBe('Path');
  const points=record[1].segments.map(s=>Array.isArray(s[0])?s[0]:s);expect(Math.min(...points.map(p=>p[0]))).toBe(350);expect(Math.max(...points.map(p=>p[0]))).toBe(450);
  const before=await page.evaluate(()=>localStorage.getItem('vector-lab'));p=await projectPoint(page,800,650);await page.mouse.click(p.x,p.y);await expect(page.locator('#status')).toContainText('No enclosed');expect(await page.evaluate(()=>localStorage.getItem('vector-lab'))).toBe(before);
});
test('paint bucket joins separate open boundaries and keeps inner islands empty',async({page})=>{
  await page.goto('/');await loadDrawing(page,'<svg xmlns="http://www.w3.org/2000/svg" width="1056" height="816"><g fill="none" stroke="black"><path d="M200 200H600"/><path d="M600 200V600"/><path d="M600 600H200"/><path d="M200 600V200"/><circle cx="400" cy="400" r="60"/></g></svg>');
  await page.keyboard.press('b');await bucketColor(page,'#ff0000');const p=await projectPoint(page,300,300);await page.mouse.click(p.x,p.y);await expect(page.locator('#status')).toContainText('new path');
  const record=await page.evaluate(()=>JSON.parse(localStorage.getItem('vector-lab'))[1].children.at(-1));expect(record[0]).toBe('CompoundPath');expect(record[1].children).toHaveLength(2);expect((await svg(page)).text).toContain('#ff0000');
});
test('paint bucket touch cancellation and pinch do not add paths',async({page})=>{
  await page.goto('/');await loadDrawing(page,'<svg xmlns="http://www.w3.org/2000/svg" width="1056" height="816"><path d="M200 200h400v400h-400z" fill="none" stroke="black"/></svg>');
  await page.keyboard.press('b');const before=await page.evaluate(()=>localStorage.getItem('vector-lab')),p=await projectPoint(page,400,400),cdp=await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});expect(await page.evaluate(()=>localStorage.getItem('vector-lab'))).toBe(before);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p,{x:p.x+40,y:p.y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});expect(await page.evaluate(()=>localStorage.getItem('vector-lab'))).toBe(before);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect(page.locator('#status')).toContainText('new path');
});
test('paint bucket preserves transformed grouped sources and rejects gaps between open paths',async({page})=>{
  await page.goto('/');await loadDrawing(page,'<svg xmlns="http://www.w3.org/2000/svg" width="1056" height="816"><g transform="translate(200 100) rotate(30)"><path d="M100 100h200v200h-200z" fill="none" stroke="black"/></g></svg>');
  const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('vector-lab'))[1].children);
  await page.keyboard.press('b');await bucketColor(page,'#ff0000');let p=await projectPoint(page,273.205,373.205);await page.mouse.click(p.x,p.y);await expect(page.locator('#status')).toContainText('new path');
  const children=await page.evaluate(()=>JSON.parse(localStorage.getItem('vector-lab'))[1].children);expect(children.slice(0,-1)).toEqual(before);expect(children.at(-1)[0]).toBe('Path');
  const saved=await svg(page);await loadDrawing(page,saved.text);expect((await svg(page)).text).toContain('#ff0000');
  await loadDrawing(page,'<svg xmlns="http://www.w3.org/2000/svg" width="1056" height="816"><path d="M200 200H600V600H200V215" fill="none" stroke="black"/></svg>');
  await page.keyboard.press('b');const unchanged=await page.evaluate(()=>localStorage.getItem('vector-lab'));p=await projectPoint(page,400,400);await page.mouse.click(p.x,p.y);await expect(page.locator('#status')).toContainText('No enclosed');expect(await page.evaluate(()=>localStorage.getItem('vector-lab'))).toBe(unchanged);
});

test('bucket fills real bitmap traces including holes, without changing the trace',async({page})=>{
  await page.goto('/');await traceFixture(page);await page.locator('#trace-image').click();await traceReady(page);await page.locator('#trace-apply').click();
  const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('vector-lab'))[1].children);
  await page.keyboard.press('b');await bucketColor(page,'#ff0000');let p=await projectPoint(page,478,378);await page.mouse.click(p.x,p.y);await expect(page.locator('#status')).toContainText('new path');
  expect(await artPixel(page,478,378)).toEqual([255,0,0]);expect(await artPixel(page,528,408)).toEqual([255,255,255]);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('vector-lab'))[1].children.slice(0,-1))).toEqual(before);
  await bucketColor(page,'#0000ff');p=await projectPoint(page,528,408);await page.mouse.click(p.x,p.y);await expect(page.locator('#status')).toContainText('new path');expect(await artPixel(page,528,408)).toEqual([0,0,255]);
});
test('blob brush bridges closed paths in the chosen color as one undoable editable path',async({page})=>{
  await page.goto('/');await loadDrawing(page,'<svg xmlns="http://www.w3.org/2000/svg" width="1056" height="816"><path d="M200 300h100v100h-100z" fill="black"/><path d="M400 300h100v100h-100z" fill="blue"/><path d="M700 300h50v50h-50z" fill="green"/></svg>');
  const before=await page.evaluate(()=>localStorage.getItem('vector-lab'));await page.keyboard.press('l');await expect(page.locator('#blob-settings')).toBeVisible();await page.locator('#blob-size').fill('40');await bucketColor(page,'#ff0000');
  const a=await projectPoint(page,280,350),b=await projectPoint(page,420,350);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:10});await page.mouse.up();await expect(page.locator('#status')).toContainText('joined 2');await settleCanvas(page);await page.screenshot({path:'/tmp/vector-lab-blob.png'});
  expect(await artPixel(page,250,350)).toEqual([255,0,0]);expect(await artPixel(page,350,350)).toEqual([255,0,0]);expect(await artPixel(page,450,350)).toEqual([255,0,0]);expect(await artPixel(page,725,325)).toEqual([0,128,0]);
  const after=await page.evaluate(()=>localStorage.getItem('vector-lab'));expect(JSON.parse(after)[1].children).toHaveLength(2);
  await page.keyboard.press('Control+z');expect(await page.evaluate(()=>localStorage.getItem('vector-lab'))).toBe(before);await page.keyboard.press('Control+Shift+z');expect(await page.evaluate(()=>localStorage.getItem('vector-lab'))).toBe(after);
  const saved=await svg(page);await loadDrawing(page,saved.text);expect(await artPixel(page,350,350)).toEqual([255,0,0]);await page.locator('[data-tool=nodes]').click();await page.keyboard.press('Control+a');await expect(page.locator('#node-count')).not.toHaveText('0 nodes selected');
});
test('blob touch cancellation and pinch discard previews and tapping makes a dot',async({page})=>{
  await page.goto('/');await page.keyboard.press('l');await bucketColor(page,'#ff0000');const before=await page.evaluate(()=>localStorage.getItem('vector-lab')),p=await projectPoint(page,528,408),cdp=await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:p.x+30,y:p.y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});expect(await page.evaluate(()=>localStorage.getItem('vector-lab'))).toBe(before);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p,{x:p.x+40,y:p.y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});expect(await page.evaluate(()=>localStorage.getItem('vector-lab'))).toBe(before);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect(page.locator('#status')).toContainText('Blob path created');
  expect(await artPixel(page,528,408)).toEqual([255,0,0]);expect(JSON.parse(await page.evaluate(()=>localStorage.getItem('vector-lab')))[1].children).toHaveLength(1);
});

test('blob smoothing slider works and repeated drawing keeps toolbar and canvas stationary',async({page})=>{
  await page.goto('/');await page.keyboard.press('l');await expect(page.locator('#blob-smoothing')).toHaveValue('100');await page.locator('#blob-smoothing').fill('150');await expect(page.locator('#blob-smoothing-value')).toHaveText('150%');
  await bucketColor(page,'#ff0000');await settleCanvas(page);const before=await page.locator('#canvas').boundingBox(),toolbar=await page.locator('.context').boundingBox();
  for(const offset of [0,60]){
    await page.mouse.move(before.x+before.width*.4,before.y+before.height*.45+offset);await page.mouse.down();for(let step=1;step<=12;step++)await page.mouse.move(before.x+before.width*(.4+.2*step/12),before.y+before.height*.45+offset+25*Math.sin(step*Math.PI/12));
    expect(await page.locator('#canvas').boundingBox()).toEqual(before);expect(await page.locator('.context').boundingBox()).toEqual(toolbar);
    await page.mouse.up();await expect(page.locator('#status')).toContainText('Blob');await expect(page.locator('#selection-dimensions')).toBeHidden();await settleCanvas(page);
    expect(await page.locator('#canvas').boundingBox()).toEqual(before);expect(await page.locator('.context').boundingBox()).toEqual(toolbar);
  }
  await page.screenshot({path:'/tmp/vector-lab-blob-smoothing.png'});
});

for(const width of [1024,768])test(`scrolling contextual toolbar keeps artwork stationary at width ${width}`,async({page})=>{
  await page.setViewportSize({width,height:768});await page.goto('/');await loadDrawing(page,'<svg xmlns="http://www.w3.org/2000/svg" width="1056" height="816"><path d="M200 200h80v80h-80z" fill="#0000ff"/></svg>');
  const r=await page.locator('#canvas').boundingBox();await page.mouse.move(r.x+r.width*.4,r.y+r.height*.4);await page.keyboard.press('=');const camera=await blueCameraLandmark(page);
  async function stationary(){await settleCanvas(page);expect(await page.locator('#canvas').boundingBox()).toEqual(r);const current=await blueCameraLandmark(page);for(const key of ['x','y','width','height'])expect(Math.abs(current[key]-camera[key])).toBeLessThanOrEqual(1);}
  await page.mouse.click(r.x+r.width/2+camera.x,r.y+r.height/2+camera.y);await expect(page.locator('#selection-dimensions')).toBeVisible();await stationary();
  await page.locator('#dimension-height').focus();expect(await page.locator('.context').evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(true);await stationary();await page.locator('#canvas').focus();
  await page.keyboard.press('n');await expect(page.locator('#panel-nodes')).toBeVisible();await stationary();await page.keyboard.press('t');await expect(page.locator('#text-settings')).toBeVisible();await stationary();
  await page.keyboard.press('s');await page.mouse.click(r.x+r.width-30,r.y+r.height-30);await expect(page.locator('#selection-dimensions')).toBeHidden();await stationary();
  await page.locator('#page-settings summary').click();await expect(page.locator('#page-width')).toBeInViewport();await stationary();await page.locator('#page-settings summary').click();
  await page.locator('#snap-button').click();await expect(page.locator('#snapping')).toBeInViewport();await stationary();await page.locator('#snap-button').click();
  await traceFixture(page);await expect(page.locator('#image-crop')).toBeVisible();await stationary();await page.locator('#image-crop summary').click();await expect(page.locator('#crop-left')).toBeInViewport();await stationary();
  await page.screenshot({path:`/tmp/vector-lab-scroll-toolbar-${width}.png`});
});

test('compact dimensions display three decimals without changing untouched geometry',async({page})=>{
  await page.goto('/');await loadDrawing(page,'<svg xmlns="http://www.w3.org/2000/svg" width="1056" height="816"><path d="M100.123456 200.654321h300.987654v100.876543h-300.987654z" fill="black"/></svg>');
  await page.keyboard.press('Control+a');await page.locator('#units').selectOption('px',{force:true});
  for(const [id,value] of [['position-x','100.123'],['position-y','200.654'],['dimension-width','300.988'],['dimension-height','100.877']]){await expect(page.locator('#'+id)).toHaveValue(value);expect((await page.locator('#'+id).boundingBox()).width).toBeLessThanOrEqual(60);}
  const before=await page.evaluate(()=>localStorage.getItem('vector-lab'));await page.locator('#dimension-width').press('Enter');expect(await page.evaluate(()=>localStorage.getItem('vector-lab'))).toBe(before);
  await page.locator('#position-x').fill('120.123456');await page.locator('#position-x').press('Enter');await expect(page.locator('#position-x')).toHaveValue('120.123');
  const first=await page.evaluate(()=>{const p=JSON.parse(localStorage.getItem('vector-lab'))[1].children[0][1].segments[0];return Array.isArray(p[0])?p[0]:p;});expect(first[0]).toBeCloseTo(120.123456,5);const originalPoint=JSON.parse(before)[1].children[0][1].segments[0];expect(first[1]).toBe(Array.isArray(originalPoint[0])?originalPoint[0][1]:originalPoint[1]);
  await page.locator('#canvas').focus();await page.keyboard.press('n');await expect(page.locator('#node-count')).toBeHidden();await expect(page.getByRole('button',{name:'Corner',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Round',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Symmetric',exact:true})).toBeVisible();
  expect((await page.locator('#panel-nodes').boundingBox()).width).toBeLessThan(270);await page.locator('#node-round').scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/vector-lab-compact-toolbar.png'});
});

test('sailboat trace preserves straight sails while retaining curved hull paths',async({page})=>{
  await page.goto('/');
  const encoded=await page.evaluate(async()=>{
    const source='<svg xmlns="http://www.w3.org/2000/svg" width="320" height="260"><g stroke="black" stroke-width="8" stroke-linejoin="round" stroke-linecap="round"><path d="M150 20 60 180 150 175z" fill="#60bddd"/><path d="M150 20 240 170 150 175z" fill="#aeedfa"/><path d="M150 20V205"/><path d="M40 205 280 185Q260 250 220 250H90Q50 250 40 205z" fill="#ffd34b"/><path d="M45 220 180 208M230 205 267 201"/></g></svg>';
    const image=new Image();image.src='data:image/svg+xml,'+encodeURIComponent(source);await image.decode();const c=document.createElement('canvas');c.width=320;c.height=260;c.getContext('2d').drawImage(image,0,0);return c.toDataURL().split(',')[1];
  });
  await page.locator('#image-file').setInputFiles({name:'sailboat.png',mimeType:'image/png',buffer:Buffer.from(encoded,'base64')});await expect(page.locator('#status')).toContainText('Image inserted');await page.locator('#trace-image').click();await traceReady(page);
  const d=await page.locator('#trace-result path').evaluateAll(paths=>paths.map(p=>p.getAttribute('d')).join(''));expect((d.match(/L/g)||[]).length).toBeGreaterThanOrEqual(6);expect(d).toContain('C');
  const coverage=await page.locator('#trace-result svg').evaluate(async(svg,encoded)=>{
    async function mask(url){const image=new Image();image.src=url;await image.decode();const canvas=document.createElement('canvas');canvas.width=320;canvas.height=260;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,320,260);ctx.drawImage(image,0,0,320,260);const {data}=ctx.getImageData(0,0,320,260);return Array.from({length:320*260},(_,i)=>data[i*4]*.2126+data[i*4+1]*.7152+data[i*4+2]*.0722<=128);}
    const original=await mask('data:image/png;base64,'+encoded),traced=await mask('data:image/svg+xml,'+encodeURIComponent(new XMLSerializer().serializeToString(svg)));let intersection=0,union=0;for(let i=0;i<original.length;i++){if(original[i]&&traced[i])intersection++;if(original[i]||traced[i])union++;}return intersection/union;
  },encoded);expect(coverage).toBeGreaterThan(.8);
  await page.screenshot({path:'/tmp/vector-lab-trace-straight-sails.png'});await page.locator('#trace-apply').click();expect((await svg(page)).text).not.toContain('<image');
});

async function lightCharacterFixture(page){
  const encoded=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=300;c.height=260;const ctx=c.getContext('2d');ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#f782b9';ctx.lineWidth=28;
    for(const [endX,endY,bendX] of [[50,170,15],[80,225,50],[130,230,90],[190,230,240],[250,185,290],[235,135,285]]){ctx.beginPath();ctx.moveTo(150,125);ctx.bezierCurveTo(bendX,130,bendX,endY-40,endX,endY);ctx.stroke();}
    ctx.fillStyle='#f782b9';ctx.beginPath();ctx.ellipse(150,85,50,52,0,0,Math.PI*2);ctx.fill();for(const x of [132,168]){ctx.fillStyle='white';ctx.beginPath();ctx.arc(x,82,12,0,Math.PI*2);ctx.fill();ctx.fillStyle='#161616';ctx.beginPath();ctx.arc(x-2,82,4,0,Math.PI*2);ctx.fill();}return c.toDataURL().split(',')[1];});
  await page.locator('#image-file').setInputFiles({name:'light-character.png',mimeType:'image/png',buffer:Buffer.from(encoded,'base64')});await expect(page.locator('#status')).toContainText('Image inserted');
}
async function tracePreviewPixel(page,x,y){return page.locator('#trace-result svg').evaluate(async(svg,{x,y})=>{const image=new Image();image.src='data:image/svg+xml,'+encodeURIComponent(new XMLSerializer().serializeToString(svg));await image.decode();const c=document.createElement('canvas');c.width=Number(svg.getAttribute('width'));c.height=Number(svg.getAttribute('height'));const ctx=c.getContext('2d');ctx.drawImage(image,0,0);return [...ctx.getImageData(Math.floor(x/300*c.width),Math.floor(y/260*c.height),1,1).data];},{x,y});}
test('light characters get useful solid silhouettes and hollow outlines with undo and SVG export',async({page})=>{
  await page.goto('/');await lightCharacterFixture(page);await page.locator('#trace-image').click();await traceReady(page);await expect(page.locator('#trace-use-silhouette')).toBeVisible();expect((await tracePreviewPixel(page,150,65))[3]).toBe(0);
  await page.locator('#trace-use-silhouette').click();await traceReady(page);await expect(page.locator('#trace-mode')).toHaveValue('silhouette');await expect(page.locator('#trace-threshold-control')).toBeHidden();await expect(page.locator('#trace-background-control')).toBeVisible();expect(await tracePreviewPixel(page,150,65)).toEqual([0,0,0,255]);expect(await tracePreviewPixel(page,132,82)).toEqual([0,0,0,255]);
  await page.screenshot({path:'/tmp/vector-lab-character-silhouette.png'});await page.locator('#trace-apply').click();expect(await artPixel(page,528,343)).toEqual([0,0,0]);await page.keyboard.press('Control+z');expect((await svg(page)).text).toContain('<image');
  await page.keyboard.press('Control+a');await page.locator('#trace-image').click();await page.locator('#trace-mode').selectOption('outline');await traceReady(page);await expect(page.locator('#trace-outline-control')).toBeVisible();expect((await tracePreviewPixel(page,150,65))[3]).toBe(0);expect((await tracePreviewPixel(page,150,35))[3]).toBeGreaterThan(200);
  await page.screenshot({path:'/tmp/vector-lab-character-outline.png'});await page.locator('#trace-apply').click();const output=(await svg(page)).text;expect(output).not.toMatch(/<image|stroke="#/);expect(await artPixel(page,528,343)).toEqual([255,255,255]);await loadDrawing(page,output);expect(await artPixel(page,528,343)).toEqual([255,255,255]);
});
test('stacked color traces remove anti-aliased interior seams in preview and exported SVG',async({page})=>{
  await page.goto('/');const encoded=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=320;c.height=240;const ctx=c.getContext('2d');ctx.fillStyle='#ff0000';ctx.fillRect(10,10,300,220);ctx.fillStyle='#0000ff';ctx.beginPath();ctx.moveTo(160,10);ctx.bezierCurveTo(250,60,90,180,160,230);ctx.lineTo(310,230);ctx.lineTo(310,10);ctx.closePath();ctx.fill();return c.toDataURL().split(',')[1];});
  await page.locator('#image-file').setInputFiles({name:'seam-test.png',mimeType:'image/png',buffer:Buffer.from(encoded,'base64')});await expect(page.locator('#status')).toContainText('Image inserted');await page.locator('#trace-image').click();await page.locator('#trace-mode').selectOption('color');await page.locator('#trace-colors').selectOption('2');await traceReady(page);await expect(page.locator('#trace-stack')).toBeChecked();await expect(page.locator('#trace-preset')).toHaveValue('balanced');
  async function gaps(){return page.locator('#trace-result svg').evaluate(async svg=>{const image=new Image();image.src='data:image/svg+xml,'+encodeURIComponent(new XMLSerializer().serializeToString(svg));await image.decode();const c=document.createElement('canvas');c.width=320;c.height=240;const ctx=c.getContext('2d');ctx.drawImage(image,0,0,320,240);const {data}=ctx.getImageData(0,0,320,240);let gaps=0;for(let y=20;y<220;y++)for(let x=20;x<300;x++)if(data[(y*320+x)*4+3]<254)gaps++;return gaps;});}
  expect(await gaps()).toBe(0);await page.locator('#trace-stack').uncheck();await traceReady(page);expect(await gaps()).toBeGreaterThan(10);await page.locator('#trace-stack').check();await traceReady(page);expect(await gaps()).toBe(0);
  await page.screenshot({path:'/tmp/vector-lab-stacked-colors.png'});await page.locator('#trace-apply').click();const text=(await svg(page)).text;expect(text).not.toMatch(/<image|stroke="#/);
  const gapsAfterExport=await page.evaluate(async text=>{const root=new DOMParser().parseFromString(text,'image/svg+xml').documentElement;root.setAttribute('width','1056');root.setAttribute('height','816');const image=new Image();image.src='data:image/svg+xml,'+encodeURIComponent(new XMLSerializer().serializeToString(root));await image.decode();const c=document.createElement('canvas');c.width=1056;c.height=816;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);const {data}=ctx.getImageData(0,0,1056,816);let gaps=0;for(let y=308;y<508;y++)for(let x=388;x<668;x++)if(data[(y*1056+x)*4+3]<254)gaps++;return gaps;},text);expect(gapsAfterExport).toBe(0);
});

test('existing edge smoothing slider cleans a jagged color boundary at its upper end',async({page})=>{
  await page.goto('/');const encoded=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=240;c.height=180;const ctx=c.getContext('2d');ctx.fillStyle='#f48ab2';ctx.fillRect(15,20,210,130);const pixels=ctx.getImageData(0,0,240,180);for(let y=20;y<150;y++)for(let x=15;x<225;x++)if(y>70+18*Math.sin(x/65)+(Math.floor(x/3)%2?2:-2))pixels.data.set([237,88,142,255],(y*240+x)*4);ctx.putImageData(pixels,0,0);return c.toDataURL().split(',')[1];});
  await page.locator('#image-file').setInputFiles({name:'pixel-stepped-colors.png',mimeType:'image/png',buffer:Buffer.from(encoded,'base64')});await expect(page.locator('#status')).toContainText('Image inserted');await page.locator('#trace-image').click();await page.locator('#trace-mode').selectOption('color');await page.locator('#trace-colors').selectOption('2');await traceReady(page);
  const normal=Number((await page.locator('#trace-status').textContent()).match(/[\d,]+/)[0].replaceAll(',',''));await page.locator('#trace-smoothing').fill('100');await traceReady(page);await expect(page.locator('#trace-smoothing-value')).toHaveText('100%');const strong=Number((await page.locator('#trace-status').textContent()).match(/[\d,]+/)[0].replaceAll(',',''));expect(strong).toBeLessThan(normal);
  await page.screenshot({path:'/tmp/vector-lab-high-edge-smoothing.png'});await page.locator('#trace-apply').click();const output=(await svg(page)).text;expect(output).not.toContain('<image');expect(output).toContain('#ed588e');expect(output).toContain('#f48ab2');
});

test('joined paths retain complete component stroke styles after repeated SVG reopening',async({page})=>{
  await page.goto('/');
  await loadDrawing(page,'<svg xmlns="http://www.w3.org/2000/svg"><path d="M100 100h200v200h-200z" fill="red" stroke="black" stroke-width="8" stroke-linecap="round" stroke-linejoin="bevel" stroke-miterlimit="7" stroke-dasharray="12 6" stroke-dashoffset="3"/><path d="M240 140h180v180h-180z" fill="blue"/></svg>');
  await page.keyboard.press('Control+a');await page.locator('[data-boolean=unite]').click();
  await page.locator('#rotate').click();await page.locator('#grow').click();
  const expected=await svgColorGrid(page,(await svg(page)).text);
  for(let cycle=0;cycle<3;cycle++){
    await loadDrawing(page,(await svg(page)).text);
    const actual=await svgColorGrid(page,(await svg(page)).text);
    expect(Math.max(...actual.map((v,i)=>Math.abs(v-expected[i])))).toBeLessThanOrEqual(2);
    await page.keyboard.press('Control+a');await expect(page.locator('#break-apart')).toBeEnabled();
  }
  await page.locator('#break-apart').click();
  const output=(await svg(page)).text;
  for(const attribute of ['stroke-linecap="round"','stroke-linejoin="bevel"','stroke-miterlimit="7"','stroke-dasharray="12,6"','stroke-dashoffset="3"'])expect(output).toContain(attribute);
});

test('outlined text retains opacity and visibility in SVG download',async({page})=>{
  await page.goto('/');await loadDrawing(page,'<svg xmlns="http://www.w3.org/2000/svg"><text x="100" y="200" font-family="Vector Lab Sans" font-size="64" opacity="0.3" fill="red">Hello</text><text x="100" y="300" font-family="Vector Lab Sans" font-size="64" visibility="hidden">Hidden</text></svg>');
  await page.locator('#save').click();await page.locator('#vector-text').check();await expect(page.locator('#download-svg')).toBeEnabled();
  const waiting=page.waitForEvent('download');await page.locator('#download-svg').click();const download=await waiting;const output=Buffer.concat(await (await download.createReadStream()).toArray()).toString();
  expect(output).not.toContain('<text');expect(output).toContain('opacity="0.3"');expect(output).toContain('visibility="hidden"');
  await loadDrawing(page,output);expect((await svg(page)).text).toContain('opacity="0.3"');
});

test('imported group opacity and hidden artwork survive SVG round trips',async({page})=>{
  await page.goto('/');await loadDrawing(page,'<svg xmlns="http://www.w3.org/2000/svg"><g opacity="0.4" transform="translate(30 20)"><path d="M100 100h200v200h-200z" fill="red"/><path d="M200 150h200v200h-200z" fill="blue"/></g><path visibility="hidden" d="M500 100h200v200h-200z"/></svg>');
  const initial=(await svg(page)).text,expected=await svgColorGrid(page,initial);
  expect(initial).toContain('opacity="0.4"');expect(initial).toContain('visibility="hidden"');
  for(let cycle=0;cycle<2;cycle++){
    await loadDrawing(page,(await svg(page)).text);const output=(await svg(page)).text;
    expect(output).toContain('opacity="0.4"');expect(output).toContain('visibility="hidden"');
    const actual=await svgColorGrid(page,output);expect(Math.max(...actual.map((v,i)=>Math.abs(v-expected[i])))).toBeLessThanOrEqual(2);
  }
});

test('old joined SVG metadata stays compatible and invalid stroke metadata preserves the drawing',async({page})=>{
  await combineDrawing(page);const output=(await svg(page)).text;
  const editMetadata=async invalid=>page.evaluate(({output,invalid})=>{
    const doc=new DOMParser().parseFromString(output,'image/svg+xml'),node=doc.querySelector('metadata'),data=JSON.parse(node.textContent);
    for(const entry of data.shapes)for(const part of entry.build.parts){
      for(const key of ['strokeCap','strokeJoin','miterLimit','dashArray','dashOffset','strokeScaling','visible'])delete part[key];
      if(invalid)part.dashArray=[-1];
    }
    node.textContent=JSON.stringify(data);return new XMLSerializer().serializeToString(doc);
  },{output,invalid});
  await loadDrawing(page,await editMetadata(false));await page.keyboard.press('Control+a');await expect(page.locator('#break-apart')).toBeEnabled();
  const before=await page.evaluate(()=>localStorage.getItem('vector-lab'));
  await page.locator('#file').setInputFiles({name:'invalid.svg',mimeType:'image/svg+xml',buffer:Buffer.from(await editMetadata(true))});
  await expect(page.locator('#status')).toContainText('invalid reversible shape data');expect(await page.evaluate(()=>localStorage.getItem('vector-lab'))).toBe(before);
});

test('dimensions ruler toggles toolbar inputs and shape dimensions together',async({page})=>{
  await page.addInitScript(()=>localStorage.removeItem('vector-lab-dimensions'));
  await page.goto('/');const toggle=page.getByRole('button',{name:'Dimensions',exact:true});
  await expect(toggle).toBeVisible();await expect(toggle).toHaveAttribute('aria-pressed','false');
  await loadDrawing(page,'<svg xmlns="http://www.w3.org/2000/svg"><path d="M100 100h200v100h-200z" fill="red"/></svg>');await page.keyboard.press('Control+a');
  await expect(page.locator('#dimension-controls')).toBeHidden();await expect(page.locator('#dimension-labels')).toBeHidden();
  await expect(page.locator('#duplicate')).toBeVisible();
  await toggle.click();await expect(toggle).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#dimension-controls')).toBeVisible();await expect(page.locator('#selection-width-label')).toBeVisible();await expect(page.locator('#selection-height-label')).toBeVisible();
  const icon=await toggle.boundingBox(),inputs=await page.locator('#dimension-controls').boundingBox();expect(inputs.x).toBeGreaterThanOrEqual(icon.x+icon.width);expect(Math.abs(inputs.y-icon.y)).toBeLessThan(8);
  await page.locator('#selection-width-label').click();await expect(page.locator('#selection-width-label')).toBeFocused();await expect(page.locator('#handle-size')).toBeHidden();
  await toggle.click();await expect(page.locator('#dimension-controls')).toBeHidden();await expect(page.locator('#dimension-labels')).toBeHidden();
  await expect(page.locator('#duplicate')).toBeVisible();await page.keyboard.press('ArrowRight');await expect(page.locator('#dimension-labels')).toBeHidden();
  await page.setViewportSize({width:600,height:768});await expect(toggle).toBeVisible();await toggle.click();await expect(page.locator('#dimension-controls')).toBeVisible();await expect(page.locator('#selection-width-label')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

for(const apple of [false,true])test(`stacking shortcuts and tooltips use ${apple?'macOS Command':'Windows/Linux Control'}`,async({page})=>{
  await page.addInitScript(apple=>{Object.defineProperty(navigator,'platform',{value:apple?'MacIntel':'Linux x86_64'});Object.defineProperty(navigator,'userAgentData',{value:{platform:apple?'macOS':'Linux'}});},apple);
  await page.goto('/');const mod=apple?'Meta':'Control';
  for(const [id,shortcut] of [['raise',apple?'⌘]':'Ctrl+]'],['lower',apple?'⌘[':'Ctrl+['],['front',apple?'⌘⇧]':'Ctrl+Shift+]'],['back',apple?'⌘⇧[':'Ctrl+Shift+['],['duplicate',apple?'⌘D':'Ctrl+D'],['group-objects',apple?'⌘G':'Ctrl+G'],['ungroup-objects',apple?'⌘⇧G':'Ctrl+Shift+G'],['save',apple?'⌘S':'Ctrl+S'],['undo',apple?'⌘Z':'Ctrl+Z']])await expect(page.locator('#'+id)).toHaveAttribute('title',new RegExp(shortcut.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  await expect(page.locator('#front')).toHaveAttribute('aria-keyshortcuts',`${mod}+Shift+]`);
  await loadDrawing(page,'<svg xmlns="http://www.w3.org/2000/svg"><path d="M100 100h100v100h-100z" fill="red"/><path d="M300 100h100v100h-100z" fill="blue"/><path d="M500 100h100v100h-100z" fill="green"/></svg>');
  const p=await projectPoint(page,150,150);await page.mouse.click(p.x,p.y);
  for(const [key,index] of [[`${mod}+]`,1],[`${mod}+Shift+]`,2],[`${mod}+[`,1],[`${mod}+Shift+[`,0]]){await page.keyboard.press(key);expect(await savedAnchor(page,index)).toEqual([100,100]);}
  await page.keyboard.press(`${mod}+z`);expect(await savedAnchor(page,1)).toEqual([100,100]);await page.mouse.click(p.x,p.y);
  const before=await page.evaluate(()=>localStorage.getItem('vector-lab'));await page.locator('#dimension-width').focus();await page.keyboard.press(`${mod}+]`);expect(await page.evaluate(()=>localStorage.getItem('vector-lab'))).toBe(before);
  await page.locator('#canvas').focus();await page.locator('#save').click();await page.keyboard.press(`${mod}+[`);expect(await page.evaluate(()=>localStorage.getItem('vector-lab'))).toBe(before);await page.locator('#export-dialog button[value=cancel]').click();
  await expect(page.locator('#export-dialog')).toBeHidden();await page.locator('#canvas').focus();await page.keyboard.press(`${mod}+d`);expect(await savedObjects(page)).toHaveLength(4);
});

test('top toolbar long press shows a shortcut without activating the action',async({page})=>{
  await page.goto('/');await loadDrawing(page,groupingDrawing);await page.keyboard.press('Control+a');
  const duplicate=page.locator('#duplicate');await duplicate.dispatchEvent('pointerdown',{pointerId:99,pointerType:'touch',clientX:300,clientY:90});
  await expect(page.locator('#shortcut-hint')).toHaveText('Duplicate (Ctrl+D)');await duplicate.dispatchEvent('pointerup',{pointerId:99,pointerType:'touch'});await duplicate.dispatchEvent('click');expect(await savedObjects(page)).toHaveLength(2);
  await duplicate.click();expect(await savedObjects(page)).toHaveLength(4);
});

async function savedNodeCount(page){return page.evaluate(()=>{const art=JSON.parse(localStorage.getItem('vector-lab'));function count([type,item]){return type==='Path'?item.segments.length:(item.children||[]).reduce((sum,child)=>sum+count(child),0);}return count(art);});}
test('Delete removes a selected traced node while preserving its path and hole through undo and SVG reopening',async({page})=>{
  await page.goto('/');await traceFixture(page);await page.locator('#trace-image').click();await traceReady(page);await page.locator('#trace-apply').click();
  await page.locator('[data-tool=nodes]').click();const before=await savedNodeCount(page),anchor=await firstNodeWorld(page),p=await projectPoint(page,anchor.x,anchor.y);await page.mouse.click(p.x,p.y);
  await expect(page.locator('#node-count')).toHaveText('1 node selected');await page.keyboard.press('Delete');
  expect(await savedNodeCount(page)).toBe(before-1);expect(await savedObjects(page)).toHaveLength(1);
  expect(await artPixel(page,528,408)).toEqual([255,255,255]);
  await page.keyboard.press('Control+z');expect(await savedNodeCount(page)).toBe(before);await page.keyboard.press('Control+Shift+z');expect(await savedNodeCount(page)).toBe(before-1);
  const output=(await svg(page)).text;await loadDrawing(page,output);expect(await savedNodeCount(page)).toBe(before-1);expect(await artPixel(page,528,408)).toEqual([255,255,255]);
});

test('Nodes mode protects unselected paths and toolbar deletion removes multiple nodes only',async({page})=>{
  await page.goto('/');await loadDrawing(page,'<svg xmlns="http://www.w3.org/2000/svg"><path d="M100 100L200 80L300 100L300 300L200 320L100 300z" fill="red" data-paper-data="{&quot;nodeModes&quot;:{&quot;2&quot;:&quot;symmetric&quot;,&quot;4&quot;:&quot;round&quot;}}"/><path d="M500 100h100v100h-100z" fill="blue"/></svg>');await page.keyboard.press('Control+a');await page.locator('[data-tool=nodes]').click();
  const before=await page.evaluate(()=>localStorage.getItem('vector-lab'));await page.keyboard.press('Backspace');expect(await page.evaluate(()=>localStorage.getItem('vector-lab'))).toBe(before);await expect(page.locator('#delete')).toBeDisabled();
  await page.locator('#multi-nodes').check();for(const [x,y] of [[100,100],[200,80]]){const p=await projectPoint(page,x,y);await page.mouse.click(p.x,p.y);}
  await expect(page.locator('#node-count')).toHaveText('2 nodes selected');await expect(page.locator('#delete')).toHaveAttribute('title','Delete selected nodes (Delete / Backspace)');await page.locator('#delete').click();
  expect(await savedNodeCount(page)).toBe(8);const objects=await savedObjects(page);expect(objects).toHaveLength(2);expect(objects[0][1].segments).toHaveLength(4);expect(objects[0][1].closed).toBe(true);expect(objects[0][1].data.nodeModes).toEqual({'0':'symmetric','2':'round'});expect(objects[1][1].segments).toHaveLength(4);
  await page.keyboard.press('Delete');expect(await savedNodeCount(page)).toBe(8);
  await page.locator('[data-tool=select]').click();await page.keyboard.press('Delete');expect((await savedObjects(page))||[]).toHaveLength(0);
});

test('deleting all nodes of a compound subpath keeps other contours and supports Backspace',async({page})=>{
  await page.goto('/');await loadDrawing(page,'<svg xmlns="http://www.w3.org/2000/svg"><path transform="translate(20 30)" fill="red" fill-rule="evenodd" d="M100 100h300v300h-300z M200 200h100v100h-100z"/></svg>');await page.keyboard.press('Control+a');await page.locator('[data-tool=nodes]').click();
  await moveProject(page,[180,190],[350,360]);await page.mouse.up();await expect(page.locator('#node-count')).toHaveText('4 nodes selected');await page.keyboard.press('Backspace');
  expect(await savedNodeCount(page)).toBe(4);expect(await savedObjects(page)).toHaveLength(1);expect((await svg(page)).text).toContain('fill="#ff0000"');
  await page.locator('#undo').click();expect(await savedNodeCount(page)).toBe(8);await page.keyboard.press('Control+a');await page.keyboard.press('Delete');expect((await savedObjects(page))||[]).toHaveLength(0);
});

test('moved overlapping compound path keeps its own nodes selectable ahead of covering paths',async({page})=>{
  await page.goto('/');await loadDrawing(page,'<svg xmlns="http://www.w3.org/2000/svg"><path fill="#ed7915" d="M300 300h200v200h-200z M360 360v40h40v-40z"/><path fill="#ffd600" d="M250 250h300v200h-300z"/></svg>');
  await page.locator('#snap-button').click();await page.locator('#snapping').uncheck();await page.locator('#snap-button').click();
  let p=await projectPoint(page,420,480);await page.mouse.click(p.x,p.y);await page.locator('[data-tool=nodes]').click();
  p=await projectPoint(page,300,300);await page.mouse.click(p.x,p.y);await expect(page.locator('#node-count')).toHaveText('1 node selected');
  await page.locator('[data-tool=select]').click();await moveProject(page,[420,480],[450,500]);await page.mouse.up();
  await page.locator('[data-tool=nodes]').click();const anchor=await firstNodeWorld(page);expect(anchor.x).toBeCloseTo(330,2);expect(anchor.y).toBeCloseTo(320,2);
  // Clicking the moved orange outline beneath the yellow fill must keep orange selected.
  p=await projectPoint(page,330,400);await page.mouse.click(p.x,p.y);
  // Recover even if the covering yellow path has already become selected.
  p=await projectPoint(page,550,250);await page.mouse.click(p.x,p.y);
  p=await projectPoint(page,330,400);await page.mouse.click(p.x,p.y);
  p=await projectPoint(page,anchor.x,anchor.y);await page.mouse.click(p.x,p.y);await expect(page.locator('#node-count')).toHaveText('1 node selected');
  await page.keyboard.press('ArrowRight');const after=await firstNodeWorld(page);expect(after.x).toBeCloseTo(anchor.x+12,2);expect(after.y).toBeCloseTo(anchor.y,2);
  expect(await savedAnchor(page,1)).toEqual([250,250]);
});

test('moved color trace stays node-editable where another traced color overlaps it',async({page})=>{
  await page.goto('/');await traceFixture(page,'colors');await page.locator('#trace-image').click();await traceReady(page);await page.locator('#trace-mode').selectOption('color');await traceReady(page);await page.locator('#trace-apply').click();
  await page.locator('#snap-button').click();await page.locator('#snapping').uncheck();await page.locator('#snap-button').click();
  const before=await firstNodeWorld(page);let p=await projectPoint(page,488,408);await page.mouse.click(p.x,p.y);await moveProject(page,[488,408],[548,408]);await page.mouse.up();
  const anchor=await firstNodeWorld(page);expect(anchor.x).toBeCloseTo(before.x+60,2);
  await page.locator('[data-tool=nodes]').click();p=await projectPoint(page,578,408);await page.mouse.click(p.x,p.y);p=await projectPoint(page,anchor.x,anchor.y);await page.mouse.click(p.x,p.y);await expect(page.locator('#node-count')).toHaveText('1 node selected');
  await page.keyboard.press('ArrowRight');expect((await firstNodeWorld(page)).x).toBeCloseTo(anchor.x+12,2);
});

for(const [operation,edit] of [['subtract','delete'],['subtract','drag'],['subtract','round'],['subtract','nudge'],['unite','nudge'],['intersect','nudge']])test(`${operation} outline supports direct node ${edit} with reversible Undo and SVG reopening`,async({page})=>{
  await combineDrawing(page,operation);await page.locator('#snap-button').click();await page.locator('#snapping').uncheck();await page.locator('#snap-button').click();
  const original=await page.evaluate(()=>localStorage.getItem('vector-lab')),count=await savedNodeCount(page),anchor=await firstNodeWorld(page);
  await page.locator('[data-tool=nodes]').click();const p=await projectPoint(page,anchor.x,anchor.y);await page.mouse.click(p.x,p.y);await expect(page.locator('#node-count')).toHaveText('1 node selected');await expect(page.locator('#break-apart')).toBeEnabled();
  if(edit==='delete')await page.keyboard.press('Delete');
  else if(edit==='drag'){await moveProject(page,[anchor.x,anchor.y],[anchor.x+10,anchor.y+5]);await page.mouse.up();}
  else if(edit==='round')await page.locator('#node-round').click();
  else await page.keyboard.press('ArrowRight');
  await expect(page.locator('#break-apart')).toBeDisabled();expect(await savedObjects(page)).toHaveLength(1);expect(await savedNodeCount(page)).toBe(count-(edit==='delete'?1:0));
  if(edit==='drag'||edit==='nudge')expect((await firstNodeWorld(page)).x).toBeCloseTo(anchor.x+(edit==='drag'?10:1),3);
  const edited=await page.evaluate(()=>localStorage.getItem('vector-lab'));await page.locator('#undo').click();expect(await page.evaluate(()=>localStorage.getItem('vector-lab'))).toBe(original);await page.keyboard.press('Control+a');await expect(page.locator('#break-apart')).toBeEnabled();
  await page.locator('#redo').click();expect(await page.evaluate(()=>localStorage.getItem('vector-lab'))).toBe(edited);
  const output=(await svg(page)).text;expect(output).not.toContain('vector-lab-shape-building');await loadDrawing(page,output);await page.keyboard.press('Control+a');await page.locator('[data-tool=nodes]').click();await page.keyboard.press('Control+a');await expect(page.locator('#node-count')).toHaveText(`${count-(edit==='delete'?1:0)} nodes selected`);
});

test('cancelling a combined-node touch drag preserves Break Apart',async({page})=>{
  await combineDrawing(page,'subtract');const before=await page.evaluate(()=>localStorage.getItem('vector-lab'));await page.locator('[data-tool=nodes]').click();const anchor=await firstNodeWorld(page),p=await projectPoint(page,anchor.x,anchor.y);
  const canvas=page.locator('#canvas');await canvas.dispatchEvent('pointerdown',{pointerId:1,pointerType:'touch',clientX:p.x,clientY:p.y,bubbles:true});await canvas.dispatchEvent('pointermove',{pointerId:1,pointerType:'touch',clientX:p.x+15,clientY:p.y+10,bubbles:true});await canvas.dispatchEvent('pointercancel',{pointerId:1,pointerType:'touch',clientX:p.x+15,clientY:p.y+10,bubbles:true});
  await expect(page.locator('#break-apart')).toBeEnabled();expect(await page.evaluate(()=>localStorage.getItem('vector-lab'))).toBe(before);expect(await firstNodeWorld(page)).toEqual(anchor);
});
