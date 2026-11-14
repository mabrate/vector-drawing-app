import {expect} from '@playwright/test';
export const rectangle='<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120"><path id="Base" d="M0 0H160V120H0Z" fill="#508b87"/></svg>';
export const circle='<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle id="Circle" cx="50" cy="50" r="37.79527559055118" fill="teal"/></svg>';
export const stored=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('vector-lab'))[1].data?.model3d);
export const snapshot=page=>page.evaluate(()=>localStorage.getItem('vector-lab'));
export async function idle(page){await expect(page.locator('#model3d-dialog')).toHaveAttribute('aria-busy','false',{timeout:90000});}
export async function load(page,svg=rectangle){await page.goto('/');page.once('dialog',dialog=>dialog.accept());await page.locator('#file').setInputFiles({name:'profile.svg',mimeType:'image/svg+xml',buffer:Buffer.from(svg)});await expect(page.locator('#status')).toContainText('SVG opened');}
export async function open(page,svg=rectangle){await load(page,svg);await page.locator('#model3d-open').click();await idle(page);}
export async function choose(page,tool){await page.locator(`[data-model-tool=${tool}]`).click();await idle(page);}
export function pathButton(page,index=0){return page.locator('#model3d-paths [data-object-pick=path]').nth(index);}
export async function preview(page){await page.locator('#model3d-preview').click();await expect(page.locator('#model3d-apply-tool')).toBeEnabled({timeout:90000});}
export async function applyTool(page){await preview(page);await page.locator('#model3d-apply-tool').click();await expect(page.locator('#model3d-apply')).toBeEnabled();}
export async function addBox(page){await choose(page,'extrude');await pathButton(page).click();await applyTool(page);}
export async function editLast(page){await page.locator('#model3d-features li').last().locator('button').first().click();await idle(page);}
export async function center(page){const box=await page.locator('#model3d-viewer canvas').boundingBox();return {x:box.x+box.width/2,y:box.y+box.height/2};}
