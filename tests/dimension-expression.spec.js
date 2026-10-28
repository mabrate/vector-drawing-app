import {test,expect} from '@playwright/test';
import {dimensionExpression} from '../src/dimension-expression.js';
test('dimension arithmetic supports precedence, parentheses, signed decimals, and optional matching labels',()=>{
 for(const [text,expected,label] of [['105.765 + 0.25',106.015],['2 + 3 * 4',14],['(2 + 3) * 4',20],['-(2 + 3) / 2',-2.5],['.5 + 1e-3',.501],['10 − 3 × 2',4],['12 ÷ (2+1)',4],['x = 105.765 + .25',106.015,'x'],['W=2*(3+4)',14,'w']])expect(dimensionExpression(text,label)).toBeCloseTo(expected,10);
});
test('invalid arithmetic cannot execute code or produce nonfinite values',()=>{
 for(const text of ['', '1 +', '(2+3', '2 ** 3', '1 / 0', '0 / 0', '1e309', '5px', 'Math.PI', 'globalThis.alert(1)', '1;throw 2', '2(3)', '2 + ()','('.repeat(40)+'1'+')'.repeat(40)])expect(Number.isNaN(dimensionExpression(text))).toBe(true);
 expect(Number.isNaN(dimensionExpression('y=10','x'))).toBe(true);
});
async function setup(page){await page.goto('/');page.once('dialog',d=>d.accept());await page.locator('#file').setInputFiles({name:'math.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><path d="M100 100h200v100h-200z" fill="orange"/></svg>')});await expect(page.locator('#status')).toContainText('SVG opened');await page.keyboard.press('Control+a');await page.locator('#units').selectOption('px',{force:true});await page.locator('#dimensions-toggle').click();}
test('X Y W H expressions apply in page units, resolve to values, and support Undo',async({page})=>{
 await setup(page);
 for(const [id,text,value] of [['position-x','x = 105.765 + 0.25','106.015'],['position-y','(80 + 20) / 2','50'],['dimension-width','200 * 1.5','300'],['dimension-height','300 / (1 + 1)','150']]){await page.locator('#'+id).fill(text);await page.locator('#'+id).press('Enter');await expect(page.locator('#'+id)).toHaveValue(value);}
 await page.locator('#canvas').focus();await page.keyboard.press('Control+z');await page.keyboard.press('Control+a');await expect(page.locator('#dimension-height')).toHaveValue('100');await page.keyboard.press('Control+z');await page.keyboard.press('Control+a');await expect(page.locator('#dimension-width')).toHaveValue('200');
 await page.locator('#units').selectOption('in',{force:true});await page.locator('#dimension-width').fill('1 + 0.5');await page.locator('#dimension-width').press('Enter');await expect(page.locator('#dimension-width')).toHaveValue('1.5');await page.locator('#units').selectOption('px',{force:true});await expect(page.locator('#dimension-width')).toHaveValue('144');
});
test('invalid and nonpositive expressions preserve artwork, and inline math commits outside',async({page})=>{
 await setup(page);const before=await page.evaluate(()=>localStorage.getItem('vector-lab'));
 for(const text of ['100 +', '10 / 0', '1 - 2']){await page.locator('#dimension-width').fill(text);await page.locator('#dimension-width').press('Enter');expect(await page.evaluate(()=>localStorage.getItem('vector-lab'))).toBe(before);}
 await page.locator('#dimension-width').fill('200');await page.locator('#dimension-width').press('Enter');await page.locator('#selection-width-label').fill('(100 + 25) * 2');await page.locator('#file-menu-button').click();await expect(page.locator('#dimension-width')).toHaveValue('250');await expect(page.locator('#selection-width-label')).toHaveValue('250');
});
