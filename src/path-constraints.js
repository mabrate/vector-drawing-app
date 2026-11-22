import { circularLoop } from './model3d-circle.js';

const rootTolerance = 1e-11;

function polynomialValue(coefficients, t) {
  return coefficients.reduceRight((value, coefficient) => value * t + coefficient, 0);
}

// Derivative roots split the interval into monotone pieces. Check those
// boundaries too, since a tangent at an inflection can be a repeated root.
function unitRoots(coefficients) {
  const scale = Math.max(...coefficients.map(Math.abs));
  if (!scale) return [];
  const terms = coefficients.map(coefficient => coefficient / scale);
  while (terms.length > 1 && Math.abs(terms.at(-1)) < rootTolerance) terms.pop();
  if (terms.length === 1) return [];
  const derivative = terms.slice(1).map((coefficient, index) => coefficient * (index + 1));
  const boundaries = [0, ...unitRoots(derivative).filter(t => t > 0 && t < 1), 1];
  const roots = [];
  for (let index = 0; index < boundaries.length; index++) {
    let low = boundaries[index];
    let lowValue = polynomialValue(terms, low);
    if (Math.abs(lowValue) <= rootTolerance) {
      roots.push(low);
      continue;
    }
    let high = boundaries[index + 1];
    if (high === undefined) continue;
    const highValue = polynomialValue(terms, high);
    if (Math.abs(highValue) <= rootTolerance || Math.sign(lowValue) === Math.sign(highValue)) continue;
    for (let iteration = 0; iteration < 48; iteration++) {
      const middle = (low + high) / 2;
      const middleValue = polynomialValue(terms, middle);
      if (Math.sign(lowValue) === Math.sign(middleValue)) {
        low = middle;
        lowValue = middleValue;
      } else high = middle;
    }
    roots.push((low + high) / 2);
  }
  return roots;
}

function tangentTimes(curve, origin) {
  const [p0, p1, p2, p3] = curve.points;
  const a = p0.subtract(origin);
  const b = p1.subtract(p0).multiply(3);
  const c = p2.subtract(p1.multiply(2)).add(p0).multiply(3);
  const d = p3.subtract(p0).subtract(p2.subtract(p1).multiply(3));
  // A line from the origin to B(t) is tangent where (B(t) - origin) × B′(t) = 0.
  return unitRoots([a.cross(b), 2 * a.cross(c), 3 * a.cross(d) + b.cross(c), 2 * b.cross(d), c.cross(d)]);
}

export function tangentContacts(path, origin) {
  const localOrigin = path.globalToLocal(origin);
  if (!localOrigin) return [];
  const contacts = [];
  for (const curve of path.curves) {
    if (curve.isStraight()) continue;
    for (const time of tangentTimes(curve, localOrigin)) {
      const localPoint = curve.getPointAtTime(time);
      const point = path.localToGlobal(localPoint);
      const direction = curve.getTangentAtTime(time);
      const tangent = path.globalMatrix.transform(direction).subtract(path.globalMatrix.translation);
      const line = point.subtract(origin);
      if (line.length <= 1e-7 || tangent.isZero() ||
          Math.abs(line.normalize().cross(tangent.normalize())) > 1e-7) continue;
      const neighbor = time === 0 ? curve.previous : time === 1 ? curve.next : null;
      if (neighbor && neighbor.getTangentAtTime(1 - time).dot(direction) < 1 - 1e-7) continue;
      if (!contacts.some(contact => contact.point.getDistance(point) < 1e-7)) {
        contacts.push({ curve, time, point, tangent });
      }
    }
  }
  return contacts;
}

export function isPointedTipSource(path) {
  if (!path.closed || path.curves.length !== 4) return false;
  const center = path.segments[0].point.add(path.segments[2].point).divide(2);
  const x = path.segments[0].point.subtract(center);
  const y = path.segments[1].point.subtract(center);
  const determinant = x.cross(y);
  if (Math.abs(determinant) <= x.length * y.length * 1e-8) return false;
  // Normalize an affine ellipse to a unit circle for the existing four-arc check.
  return Boolean(circularLoop(path.curves.map(curve => curve.points.map(point => {
    const delta = point.subtract(center);
    return [delta.cross(y) / determinant, x.cross(delta) / determinant];
  }))));
}

export function pointedTipSegments(paper, path, tip) {
  const contacts = tangentContacts(path, tip);
  if (contacts.length !== 2) return null;
  // In the source winding, the retained arc starts where the tangent line
  // from the tip continues in the forward direction along the curve.
  const start = contacts.find(contact => contact.point.subtract(tip).dot(contact.tangent) > 0);
  if (!start) return null;
  const end = contacts.find(contact => contact !== start);
  const curves = path.curves;
  const count = curves.length;
  const first = start.curve.index;
  let last = end.curve.index;
  if (last < first || (last === first && end.time < start.time)) last += count;
  const segments = [new paper.Segment(path.globalToLocal(tip))];
  for (let index = first; index <= last; index++) {
    const from = index === first ? start.time : 0;
    const to = index === last ? end.time : 1;
    if (to - from <= rootTolerance) continue;
    const part = curves[index % count].getPart(from, to);
    if (segments.length === 1) {
      segments.push(new paper.Segment(part.point1, null, part.handle1));
    } else segments.at(-1).handleOut = part.handle1;
    segments.push(new paper.Segment(part.point2, part.handle2));
  }
  return segments.length >= 3 ? segments : null;
}
