import paper from 'paper';

const axes = ['x', 'y'];

function interval(bounds, axis) {
  return axis === 'x' ? [bounds.left, bounds.right] : [bounds.top, bounds.bottom];
}

function overlap([minA, maxA], [minB, maxB]) {
  return Math.min(maxA, maxB) - Math.max(minA, minB);
}

function sidesOverlap(bounds, target, axis, slide = 0) {
  const across = axis === 'x' ? 'y' : 'x';
  const [min, max] = interval(bounds, across);
  return overlap([min + slide, max + slide], interval(target, across)) >= 0;
}

export function snapBounds(bounds, targets, {edges, centers, tolerance}, locks) {
  const offset = new paper.Point();
  const nextLocks = {};
  for (const axis of axes) {
    const across = axis === 'x' ? 'y' : 'x';
    const span = interval(bounds, across);
    const [min, max] = interval(bounds, axis);
    let best;
    const consider = (kind, source, value, reference, edge) => {
      const delta = value - source;
      const distance = Math.abs(delta);
      const lock = locks?.[axis];
      const held = lock?.kind === kind && lock.reference === reference && lock.edge === edge && lock.value === value;
      if (distance >= tolerance * (held ? 1.5 : 1)) return;
      // A touching side takes priority over an alignment guide. A small release
      // margin keeps the current guide stable within that priority.
      const priority = kind === 'contact' ? 1 : 0;
      const score = held ? -1 : distance;
      if (!best || priority > best.priority || priority === best.priority && score < best.score) {
        best = {kind, value, reference, edge, delta, priority, score};
      }
    };
    for (const {item, bounds: target} of targets) {
      const [start, end] = interval(target, axis);
      if (edges) {
        consider('edge', min, start, item, 'min');
        consider('edge', max, end, item, 'max');
        if (item && sidesOverlap(bounds, target, axis)) {
          consider('contact', max, start, item, 'max');
          consider('contact', min, end, item, 'min');
        }
      }
      if (centers) consider('center', bounds.center[axis], target.center[axis], item);
    }
    if (centers) {
      const neighbors = targets.filter(target => target.item && overlap(span, interval(target.bounds, across)) > 0);
      for (const left of neighbors) for (const right of neighbors) {
        if (left === right || overlap(interval(left.bounds, across), interval(right.bounds, across)) <= 0) continue;
        const end = interval(left.bounds, axis)[1], start = interval(right.bounds, axis)[0];
        if (start - end >= max - min) consider('spacing', bounds.center[axis], (end + start) / 2, left.item, right.item);
      }
    }
    if (best) {
      offset[axis] = best.delta;
      nextLocks[axis] = best;
    }
  }
  for (const axis of axes) {
    const contact = nextLocks[axis];
    if (contact?.kind !== 'contact') continue;
    const across = axis === 'x' ? 'y' : 'x';
    if (sidesOverlap(bounds, contact.reference.bounds, axis, offset[across])) continue;
    // Keep a real contact when a perpendicular guide would pull the sides apart.
    const conflicting = nextLocks[across];
    const drop = conflicting?.kind === 'contact' && conflicting.score < contact.score ? axis : across;
    delete nextLocks[drop];
    offset[drop] = 0;
  }
  return {offset, locks: nextLocks};
}

export function snapMovingAnchors(anchors, offset, points, tolerance, locks, bounds) {
  if (!anchors.length || !points.length) return null;
  // Check neighboring cells so moving two detailed paths does not compare every pair of nodes.
  const cells = new Map();
  const cell = value => Math.floor(value / tolerance);
  const key = (x, y) => `${x},${y}`;
  for (const point of points) {
    const id = key(cell(point.x), cell(point.y));
    if (!cells.has(id)) cells.set(id, []);
    cells.get(id).push(point);
  }
  let best = null, distance = tolerance;
  for (const anchor of anchors) {
    const from = anchor.add(offset);
    const x = cell(from.x), y = cell(from.y);
    for (let col = x - 1; col <= x + 1; col++) for (let row = y - 1; row <= y + 1; row++) {
      const bucket = cells.get(key(col, row));
      if (!bucket) continue;
      for (const point of bucket) {
        const gap = point.getDistance(from);
        if (gap >= distance) continue;
        const delta = point.subtract(from);
        const breaksContact = axes.some(axis => {
          const lock = locks[axis], across = axis === 'x' ? 'y' : 'x';
          return lock?.kind === 'contact' && (Math.abs(lock.delta - delta[axis]) > 1e-6 ||
            !sidesOverlap(bounds, lock.reference.bounds, axis, delta[across]));
        });
        if (breaksContact) continue;
        best = {point, delta};
        distance = gap;
      }
    }
  }
  return best;
}

export function snapPoint(point, {anchors, curves, centers, page, tolerance, ray}) {
  let best = null, distance = tolerance;
  const consider = (candidate, label) => {
    const gap = point.getDistance(candidate);
    if (gap >= distance) return;
    if (ray) {
      const delta = candidate.subtract(ray.origin);
      if (delta.dot(ray.direction) < 0 || Math.abs(delta.cross(ray.direction)) > 1e-6) return;
    }
    best = {point: candidate, label};
    distance = gap;
  };

  for (const anchor of anchors) consider(anchor, 'Snapped to node');
  if (best) return best;

  for (const {curve, matrix} of curves) {
    // Measure in project space so scaled and rotated paths snap where they appear.
    const values = curve.getValues(matrix);
    if (!paper.Curve.getBounds(values).expand(2 * distance).contains(point)) continue;
    const time = paper.Curve.getNearestTime(values, point);
    consider(paper.Curve.getPoint(values, time), 'Snapped to path');
    if (ray) {
      const {origin, direction} = ray;
      for (const t of paper.Curve.getCurveLineIntersections(values, origin.x, origin.y, direction.x, direction.y)) {
        consider(paper.Curve.getPoint(values, t), 'Snapped to path');
      }
    }
  }
  if (page) for (const axis of axes) {
    const across = axis === 'x' ? 'y' : 'x';
    const [min, max] = interval(page, across);
    for (const edge of interval(page, axis)) {
      const candidate = point.clone();
      candidate[axis] = edge;
      if (ray && Math.abs(ray.direction[axis]) > 1e-8) {
        candidate[across] = ray.origin[across] + (edge - ray.origin[axis]) * ray.direction[across] / ray.direction[axis];
        if (candidate[across] < min || candidate[across] > max) continue;
      } else candidate[across] = Math.max(min, Math.min(max, point[across]));
      consider(candidate, 'Snapped to artboard edge');
    }
  }
  if (best) return best;
  for (const center of centers) consider(center, 'Snapped to center');
  return best;
}

export function snapAxes(point, targets, tolerance, {ray, locks} = {}) {
  const alignments = [];
  let result = point.clone(), distance = tolerance;
  for (const axis of axes) {
    let nearest = tolerance, value;
    const lock = locks?.[axis];
    if (lock !== undefined && Math.abs(lock - point[axis]) < 1.5 * tolerance && targets[axis].includes(lock)) {
      nearest = -1;
      value = lock;
    }
    for (const target of targets[axis]) {
      const gap = Math.abs(target - point[axis]);
      if (gap < nearest) { nearest = gap; value = target; }
    }
    if (value === undefined) continue;
    alignments.push({axis, value});
    if (!ray) result[axis] = value;
    else if (Math.abs(ray.direction[axis]) > 1e-8) {
      const length = (value - ray.origin[axis]) / ray.direction[axis];
      const candidate = ray.origin.add(ray.direction.multiply(length));
      const gap = candidate.getDistance(point);
      if (length >= 0 && gap < distance) { distance = gap; result = candidate; }
    }
  }
  return {point: result, alignments: alignments.filter(({axis, value}) => Math.abs(result[axis] - value) < 1e-6)};
}
