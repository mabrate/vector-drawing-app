// Exercise the canvas handles used for selection transforms.
async function handles(page) {
  await page.locator('#canvas').focus();
  await page.keyboard.press('s');
  return page.evaluate(async () => {
    const {default: paper} = await import(performance.getEntriesByType('resource').find(e => e.name.includes('/deps/paper.js')).name);
    const overlay = paper.project.layers[2];
    const squares = overlay.children.filter(p => p.fillColor?.toCSS(true) === '#ffffff' && p.strokeColor?.toCSS(true) === '#267d81');
    const bounds = squares.map(p => p.position).reduce((r, p) => r ? r.include(p) : new paper.Rectangle(p, p), null);
    const rotation = overlay.children.find(p => p.fillColor?.toCSS(true) === '#c9f278');
    const rect = document.querySelector('#canvas').getBoundingClientRect();
    const screen = p => { const v = paper.view.projectToView(p); return {x: rect.x + v.x, y: rect.y + v.y}; };
    return {center: screen(bounds.center), rotation: screen(rotation.position), corner: screen(bounds.bottomRight), anchor: screen(bounds.topLeft)};
  });
}

export async function rotateSelection(page, degrees = 15) {
  const {center, rotation} = await handles(page), angle = degrees * Math.PI / 180;
  const dx = rotation.x - center.x, dy = rotation.y - center.y;
  await page.mouse.move(rotation.x, rotation.y);
  await page.mouse.down();
  await page.keyboard.down('Control');
  await page.mouse.move(center.x + dx * Math.cos(angle) - dy * Math.sin(angle), center.y + dx * Math.sin(angle) + dy * Math.cos(angle), {steps: 8});
  await page.mouse.up();
  await page.keyboard.up('Control');
}

export async function scaleSelection(page, factor) {
  const {corner, anchor} = await handles(page);
  await page.mouse.move(corner.x, corner.y);
  await page.mouse.down();
  await page.keyboard.down('Control');
  await page.mouse.move(anchor.x + (corner.x - anchor.x) * factor, anchor.y + (corner.y - anchor.y) * factor, {steps: 8});
  await page.mouse.up();
  await page.keyboard.up('Control');
}

export async function useCropTool(page) {
  await page.locator('#canvas').focus();
  await page.keyboard.press('c');
}
