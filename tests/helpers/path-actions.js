export async function openPathMenu(page){
 if(await page.locator('#path-menu').isHidden())await page.locator('#path-menu-button').click();
}
export async function pathAction(page,selector){
 await openPathMenu(page);await page.locator(selector).click();
}
