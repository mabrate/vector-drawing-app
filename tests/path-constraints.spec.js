import { expect, test } from '@playwright/test';
import paper from 'paper';
import { isPointedTipSource, pointedTipSegments, tangentContacts } from '../src/path-constraints.js';

test.use({ launchOptions: { executablePath: '/usr/bin/google-chrome' } });

const circle = '<circle cx="520" cy="395" r="100" fill="#539ed0"/>';

async function openSVG(page, markup, complete = false) {
  const svg = complete ? markup :
    '<svg xmlns="http://www.w3.org/2000/svg" width="1056" height="816">' + markup + '</svg>';
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#file').setInputFiles({ name: 'constraints.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) });
  await expect(page.locator('#status')).toContainText('SVG opened');
}

async function browserSketch(page, points = []) {
  return page.evaluate(async points => {
    const source = performance.getEntriesByType('resource').find(entry => entry.name.includes('/deps/paper.js'));
    const { default: paper } = await import(source.name);
    await new Promise(requestAnimationFrame);
    const canvas = document.querySelector('#canvas').getBoundingClientRect();
    const describe = path => ({
      pathData: path.pathData,
      closed: path.closed,
      segments: path.segments.map(segment => {
        const point = path.localToGlobal(segment.point);
        return [point.x, point.y].map(value => Number(value.toFixed(8)));
      }),
      straight: path.curves.map(curve => curve.isStraight()),
      constraints: path.data.pathConstraints || [],
      fill: path.fillColor?.toCSS(true)
    });
    const preview = paper.project.getItem({ name: 'pointed-tip-preview' }) ||
      paper.project.getItem({ name: 'pen-preview' });
    return {
      points: points.map(pair => {
        const p = paper.view.projectToView(new paper.Point(pair));
        return { x: canvas.x + p.x, y: canvas.y + p.y };
      }),
      artwork: paper.project.layers[1].children.map(describe),
      preview: preview ? describe(preview) : null,
      contact: Boolean(paper.project.getItem({ name: 'pen-constraint-contact' }))
    };
  }, points);
}

const saved = page => page.evaluate(() => localStorage.getItem('vector-lab'));
const cross = (a, b) => a.normalize().cross(b.normalize());

async function expectLiveTangents(page, count) {
  const measurements = await page.evaluate(async () => {
    const source = performance.getEntriesByType('resource').find(entry => entry.name.includes('/deps/paper.js'));
    const { default: paper } = await import(source.name);
    const art = paper.project.layers[1];
    return art.children.flatMap(path => (path.data.pathConstraints || []).map(record => {
      const { from, to } = record;
      const origin = path.localToGlobal(path.segments[from].point);
      const contact = path.localToGlobal(path.segments[to].point);
      const line = contact.subtract(origin).normalize();
      if (record.type === 'tangent-join') {
        const segment = path.segments[to];
        const key = segment.previous === path.segments[from] ? 'handleOut' : 'handleIn';
        const direction = path.localToGlobal(segment.point.add(segment[key])).subtract(contact);
        return { gap: 0, error: Math.abs(line.cross(direction.normalize())) };
      }
      const target = art.children.find(item => item.data.constraintPathId === record.target.id);
      const location = target.getNearestLocation(target.globalToLocal(contact));
      const tangent = target.globalMatrix.transform(location.tangent).subtract(target.globalMatrix.translation);
      return { gap: contact.getDistance(target.localToGlobal(location.point)), error: Math.abs(line.cross(tangent.normalize())) };
    }));
  });
  expect(measurements).toHaveLength(count);
  for (const { gap, error } of measurements) {
    expect(gap).toBeLessThan(.001);
    expect(error).toBeLessThan(.00001);
  }
}

async function dragBetween(page, from, to) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.mouse.up();
}

async function downloadSVG(page) {
  await page.locator('#save').click();
  const pending = page.waitForEvent('download');
  await page.locator('#download-svg').click();
  const stream = await (await pending).createReadStream();
  return Buffer.concat(await stream.toArray()).toString();
}

test('finds tangent contacts on transformed curves and builds a closed tip with the retained arc', () => {
  paper.setup([800, 600]);
  try {
    const ellipse = new paper.Path.Ellipse({ center: [300, 280], radius: [100, 65], applyMatrix: false });
    ellipse.shear(.32, .18);
    ellipse.rotate(32);
    ellipse.reverse();
    const tip = new paper.Point(220, 70);
    expect(isPointedTipSource(ellipse)).toBe(true);
    expect(tangentContacts(ellipse, ellipse.position)).toHaveLength(0);
    const contacts = tangentContacts(ellipse, tip);
    expect(contacts).toHaveLength(2);
    for (const { point, tangent } of contacts) {
      expect(cross(point.subtract(tip), tangent)).toBeCloseTo(0, 9);
    }

    const segments = pointedTipSegments(paper, ellipse, tip);
    const outline = new paper.Path({ segments, closed: true });
    const curves = outline.curves;
    expect(curves.slice(1, -1).every(curve => !curve.isStraight())).toBe(true);
    expect(curves[0].isStraight() && curves.at(-1).isStraight()).toBe(true);
    expect(cross(curves[0].getTangentAtTime(1), curves[1].getTangentAtTime(0))).toBeCloseTo(0, 9);
    expect(cross(curves.at(-2).getTangentAtTime(1), curves.at(-1).getTangentAtTime(0))).toBeCloseTo(0, 9);
    expect(outline.contains(ellipse.globalToLocal(ellipse.position))).toBe(true);

    const inflection = new paper.Path({ pathData: 'M0 -1 C1 1 2 -1 3 1' });
    const throughInflection = tangentContacts(inflection, new paper.Point(-1, 0));
    expect(throughInflection).toHaveLength(1);
    expect(throughInflection[0].time).toBeCloseTo(.5, 9);
  } finally {
    paper.project.remove();
  }
});

test('Pen previews and commits either tangent without editing the target path', async ({ page }) => {
  await page.goto('/');
  await openSVG(page, circle);
  const { artwork: original, points: [start, left, right, noContact] } =
    await browserSketch(page, [[520, 195], [434, 345], [606, 345], [520, 340]]);
  await page.locator('[data-tool=pen]').click();
  await page.getByLabel('Constraints', { exact: true }).selectOption('tangent');
  await page.mouse.click(start.x, start.y);
  await page.mouse.click(noContact.x, noContact.y);
  expect((await browserSketch(page)).artwork[1].segments).toHaveLength(1);
  await page.mouse.move(left.x, left.y);
  const leftPreview = await browserSketch(page);
  expect(leftPreview.contact).toBe(true);
  expect(leftPreview.preview.segments[1][0]).toBeLessThan(520);
  await page.mouse.move(right.x, right.y);
  const rightPreview = await browserSketch(page);
  expect(rightPreview.contact).toBe(true);
  expect(rightPreview.preview.segments[1][0]).toBeGreaterThan(520);
  await page.mouse.click(right.x, right.y);
  await page.keyboard.press('Enter');
  const committed = await browserSketch(page);
  expect(committed.artwork[0]).toEqual(original[0]);
  expect(committed.artwork[1].segments).toEqual(rightPreview.preview.segments);
  expect(committed.artwork[1].straight).toEqual([true]);
  expect(committed.preview).toBeNull();
});

test.describe('touch placement', () => {
  test.use({ hasTouch: true });
  test('Pen waits for touch release to confirm its preview', async ({ page }) => {
    await page.goto('/');
    await openSVG(page, circle);
    const { points: [start, between, left] } = await browserSketch(page, [[520, 195], [520, 340], [434, 345]]);
    await page.locator('[data-tool=pen]').tap();
    await page.getByLabel('Constraints', { exact: true }).selectOption('tangent');
    await page.touchscreen.tap(start.x, start.y);
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, point) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: point ? [point] : [] });
    await touch('touchStart', between);
    await touch('touchMove', left);
    let state = await browserSketch(page);
    expect(state.contact).toBe(true);
    expect(state.artwork[1].segments).toHaveLength(1);
    await touch('touchCancel');
    expect((await browserSketch(page)).artwork[1].segments).toHaveLength(1);
    await touch('touchStart', between);
    await touch('touchMove', left);
    await touch('touchEnd');
    state = await browserSketch(page);
    expect(state.artwork[1].straight).toEqual([true]);
    expect(state.artwork[1].segments[1][0]).toBeLessThan(520);
  });
});

test('pointed-tip preview is reversible and the applied outline survives recovery and SVG reopen', async ({ page }) => {
  await page.goto('/');
  await openSVG(page, '<ellipse cx="480" cy="380" rx="100" ry="80" fill="#539ed0" transform="skewX(12)"/>');
  const { points: [center, start, end] } = await browserSketch(page, [[560, 380], [550, 205], [660, 195]]);
  await page.mouse.click(center.x, center.y);
  const before = await saved(page);
  await page.getByRole('button', { name: 'Add pointed tip' }).click();
  await page.mouse.click(center.x, center.y);
  await expect(page.getByRole('button', { name: 'Apply tip' })).toBeDisabled();
  expect(await saved(page)).toBe(before);
  await page.keyboard.press('Escape');
  expect((await browserSketch(page)).preview).toBeNull();

  await page.getByRole('button', { name: 'Add pointed tip' }).click();
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 4 });
  await page.mouse.up();
  const { preview } = await browserSketch(page);
  expect(preview.segments[0][0]).toBeCloseTo(660);
  expect(preview.segments[0][1]).toBeCloseTo(195);
  expect(await saved(page)).toBe(before);
  await page.getByRole('button', { name: 'Apply tip' }).click();
  const { artwork } = await browserSketch(page);
  expect(artwork).toHaveLength(1);
  expect(artwork[0]).toMatchObject({ closed: true, straight: preview.straight, fill: '#539ed0' });
  expect(artwork[0].segments).toEqual(preview.segments);
  const result = await saved(page);
  await page.locator('#canvas-undo').click();
  expect(await saved(page)).toBe(before);
  await page.locator('#canvas-redo').click();
  expect(await saved(page)).toBe(result);
  await page.reload();
  expect((await browserSketch(page)).artwork).toEqual(artwork);
  await expectLiveTangents(page, 2);

  const svg = await downloadSVG(page);
  expect(svg).not.toContain('pointed-tip-preview');
  await openSVG(page, svg, true);
  const reopened = (await browserSketch(page)).artwork;
  expect(reopened).toHaveLength(1);
  expect(reopened[0]).toMatchObject({ closed: true, straight: preview.straight, fill: '#539ed0' });
  expect(reopened[0].segments[0][0]).toBeCloseTo(660);
  await page.locator('[data-tool=nodes]').click();
  const { points: [apex, moved] } = await browserSketch(page, [reopened[0].segments[0], [690, 170]]);
  await dragBetween(page, apex, moved);
  expect((await browserSketch(page)).artwork[0].segments[0][0]).toBeCloseTo(690, 0);
  await expectLiveTangents(page, 2);
});

test('Shift-click adds an endpoint on a different open path', async ({ page }) => {
  await page.goto('/');
  await openSVG(page, '<path d="M300 300 L400 350" fill="none" stroke="black"/>' +
    '<path d="M500 350 L600 300" fill="none" stroke="black"/>');
  await page.locator('[data-tool=nodes]').click();
  const { points: [first, second] } = await browserSketch(page, [[400, 350], [500, 350]]);
  await page.mouse.click(first.x, first.y);
  await expect(page.locator('#node-count')).toHaveText('1 node selected');
  await page.keyboard.down('Shift');
  await page.mouse.click(second.x, second.y);
  await page.keyboard.up('Shift');
  await expect(page.locator('#node-count')).toHaveText('2 nodes selected');
  await expect(page.locator('#join-nodes')).toBeEnabled();
  await page.locator('#join-nodes').click();
  expect((await browserSketch(page)).artwork).toHaveLength(1);
});

test('joining coincident Pen endpoints keeps both tangent links through node edits and SVG reopening', async ({ page }) => {
  await page.goto('/');
  await openSVG(page, circle);
  const { points: [start, left, right] } = await browserSketch(page, [[520, 195], [434, 345], [606, 345]]);
  await page.locator('[data-tool=pen]').click();
  await page.getByLabel('Constraints', { exact: true }).selectOption('tangent');
  for (const contact of [left, right]) {
    await page.mouse.click(start.x, start.y);
    await page.mouse.click(contact.x, contact.y);
    await page.keyboard.press('Enter');
  }
  await page.locator('[data-tool=select]').click();
  await page.keyboard.press('Control+a');
  await page.locator('[data-tool=nodes]').click();
  await page.mouse.click(start.x, start.y);
  await page.keyboard.down('Shift');
  await page.mouse.click(start.x, start.y);
  await page.keyboard.up('Shift');
  await expect(page.locator('#join-nodes')).toBeEnabled();
  await page.locator('#join-nodes').click();

  const { artwork: joined, points: [newTip, center] } = await browserSketch(page, [[560, 210], [520, 395]]);
  expect(joined).toHaveLength(2);
  expect(joined[1].segments).toHaveLength(3);
  await dragBetween(page, start, newTip);
  const moved = await browserSketch(page);
  expect(moved.artwork[1].segments[1][0]).toBeCloseTo(560, 0);
  expect(moved.artwork[1].segments[0]).not.toEqual(joined[1].segments[0]);
  await expectLiveTangents(page, 2);
  const valid = await saved(page);
  await dragBetween(page, newTip, center);
  await expect(page.locator('#status')).toContainText('cannot keep the tangent');
  expect(await saved(page)).toBe(valid);

  await page.locator('#canvas-undo').click();
  expect((await browserSketch(page)).artwork).toEqual(joined);
  await page.locator('#canvas-redo').click();
  await page.reload();
  await expectLiveTangents(page, 2);
  await openSVG(page, await downloadSVG(page), true);
  await expectLiveTangents(page, 2);

  const { points: [oldCenter, newCenter] } = await browserSketch(page, [[520, 395], [550, 415]]);
  const beforeMove = await browserSketch(page);
  await dragBetween(page, oldCenter, newCenter);
  const afterMove = await browserSketch(page);
  expect(afterMove.artwork[0].segments[0]).not.toEqual(beforeMove.artwork[0].segments[0]);
  expect(afterMove.artwork[1].segments[1]).toEqual(beforeMove.artwork[1].segments[1]);
  await expectLiveTangents(page, 2);
});

test('an existing line can acquire and release a persistent tangent in Nodes', async ({ page }) => {
  await page.goto('/');
  await openSVG(page, circle + '<path d="M520 195 L430 345" fill="none" stroke="black"/>');
  const { points: [end] } = await browserSketch(page, [[430, 345]]);
  await page.locator('[data-tool=nodes]').click();
  await page.mouse.click(end.x, end.y);
  await page.getByRole('button', { name: 'Constrain tangent', exact: true }).click();
  await page.mouse.click(end.x, end.y);
  await expectLiveTangents(page, 1);
  await page.getByRole('button', { name: 'Remove tangent', exact: true }).click();
  await expectLiveTangents(page, 0);
  await page.locator('#canvas-undo').click();
  await expectLiveTangents(page, 1);
});
