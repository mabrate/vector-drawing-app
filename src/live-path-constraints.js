import { tangentContacts } from './path-constraints.js';

const constraintsKey = 'pathConstraints';
const idKey = 'constraintPathId';
const epsilon = 1e-7;

function constraintPathId() {
  return crypto.randomUUID?.() || Array.from(crypto.getRandomValues(new Uint32Array(4)), value =>
    value.toString(16).padStart(8, '0')).join('');
}

function lineHandles(from, to) {
  if (from?.next === to) return ['handleOut', 'handleIn', 'handleOut'];
  if (to?.next === from) return ['handleIn', 'handleOut', 'handleIn'];
  return null;
}

export function tangentAtJoin(from, to) {
  const handles = lineHandles(from, to);
  if (!handles) return false;
  const curve = handles[2] === 'handleOut' ? to.next && to.curve : to.previous?.curve;
  return Boolean(curve && !curve.isStraight());
}

function referenceAt(target, curve, time) {
  return (curve.index + time) / target.curves.length;
}

function savedLocation(location) {
  return Number(location.toFixed(12));
}

function positionAt(segment) {
  return segment.path.localToGlobal(segment.point);
}

// External tangents drive one endpoint on a reference path. A tangent at a
// joined anchor drives the handle on the curved side of that anchor.
export function createPathConstraints(paper, art) {
  let active = false;
  const paths = () => art.getItems({ class: paper.Path });
  const carrier = path => path.parent instanceof paper.CompoundPath ? path.parent : path;
  const records = path => Array.isArray(path.data[constraintsKey]) ? path.data[constraintsKey] : [];
  const targetRef = path => {
    const item = carrier(path);
    item.data[idKey] ||= constraintPathId();
    return { id: item.data[idKey], ...(item !== path ? { part: path.index } : {}) };
  };

  function read(all = paths()) {
    const byId = new Map();
    for (const path of all) {
      const item = carrier(path), id = item.data[idKey];
      if (typeof id === 'string') byId.set(id, byId.has(id) && byId.get(id) !== item ? null : item);
    }
    return all.flatMap(owner => records(owner).map(record => {
      if (!record || !['tangent', 'tangent-join'].includes(record.type) ||
          !Number.isInteger(record.from) || !Number.isInteger(record.to)) return null;
      const from = owner.segments[record.from], to = owner.segments[record.to];
      if (!from || !to || from === to || !lineHandles(from, to)) return null;
      if (record.type === 'tangent-join') {
        const curveSide = lineHandles(from, to)[2];
        if (!(curveSide === 'handleOut' ? to.next : to.previous)) return null;
        return { owner, record, from, to };
      }
      const item = byId.get(record.target?.id);
      const target = item instanceof paper.CompoundPath ? item.children[record.target.part] : item;
      if (!(target instanceof paper.Path) || target === owner || !target.curves.length ||
          !Number.isFinite(record.at) || record.at < 0 || record.at > 1) return null;
      return { owner, record, from, to, target };
    }).filter(Boolean));
  }

  function add(from, to, contact) {
    const owner = from.path;
    if (contact) {
      const target = contact.curve.path;
      owner.data[constraintsKey] = [...records(owner), {
        type: 'tangent', from: from.index, to: to.index,
        target: targetRef(target), at: savedLocation(referenceAt(target, contact.curve, contact.time))
      }];
    } else {
      owner.data[constraintsKey] = [...records(owner), { type: 'tangent-join', from: from.index, to: to.index }];
    }
    active = true;
  }

  function remove(nodes, drivenOnly = false) {
    const selected = new Set(nodes);
    for (const owner of new Set(nodes.map(segment => segment.path))) {
      const remaining = records(owner).filter(record =>
        record && !selected.has(owner.segments[record.to]) && (drivenOnly || !selected.has(owner.segments[record.from])));
      if (remaining.length) owner.data[constraintsKey] = remaining;
      else delete owner.data[constraintsKey];
    }
  }

  function saveGeometry(links = read()) {
    const snapshots = new Map();
    for (const { from, to } of links) {
      for (const segment of [from, to]) if (!snapshots.has(segment)) snapshots.set(segment, segment.clone());
    }
    return snapshots;
  }

  function restoreGeometry(snapshots) {
    for (const [segment, snapshot] of snapshots) {
      if (!segment.path) continue;
      segment.point = snapshot.point;
      segment.handleIn = snapshot.handleIn;
      segment.handleOut = snapshot.handleOut;
    }
  }

  function solve({ remember = false, preferred = new Set() } = {}) {
    if (!active) return true;
    const all = paths(), links = read(all), original = saveGeometry(links);
    const byOwner = new Map(), byContact = new Map(), locations = new Map();
    for (const link of links) {
      const entries = byOwner.get(link.owner) || [];
      entries.push(link);
      byOwner.set(link.owner, entries);
      if (link.target) {
        if (byContact.has(link.to)) return false;
        byContact.set(link.to, link);
      }
    }
    const visiting = new Set(), solved = new Set();
    function apply(link) {
      if (!link || solved.has(link)) return true;
      if (visiting.has(link)) return false;
      visiting.add(link);
      const { owner, from, to, target, record } = link;
      if (!apply(byContact.get(from))) return false;
      const [startHandle, endHandle, curveHandle] = lineHandles(from, to);
      if (target) {
        if (!(byOwner.get(target) || []).every(apply)) return false;
        const requested = positionAt(to), linear = preferred.has(to) && !preferred.has(from);
        let best, score = Infinity;
        for (const contact of tangentContacts(target, positionAt(from))) {
          const location = referenceAt(target, contact.curve, contact.time);
          const gap = Math.abs(location - record.at);
          const distance = linear ? contact.point.getDistance(requested) :
            target.closed ? Math.min(gap, 1 - gap) : gap;
          if (distance < score) {
            best = { point: contact.point, location };
            score = distance;
          }
        }
        if (!best) return false;
        const local = owner.globalToLocal(best.point);
        if (!local) return false;
        if (to.point.getDistance(local) > epsilon) to.point = local;
        locations.set(record, best.location);
      } else {
        const direction = to.point.subtract(from.point);
        const length = to[curveHandle].length;
        if (direction.length < epsilon || length < epsilon) return false;
        const handle = direction.normalize(length);
        if (to[curveHandle].getDistance(handle) > epsilon) to[curveHandle] = handle;
      }
      if (from[startHandle].length) from[startHandle] = [0, 0];
      if (to[endHandle].length) to[endHandle] = [0, 0];
      visiting.delete(link);
      solved.add(link);
      return true;
    }

    if (!links.every(apply)) {
      restoreGeometry(original);
      return false;
    }
    if (remember) {
      const targets = new Set(links.filter(link => link.target).map(link => carrier(link.target)));
      for (const [record, location] of locations) record.at = savedLocation(location);
      for (const owner of all) {
        const remaining = byOwner.get(owner);
        if (remaining?.length) owner.data[constraintsKey] = remaining.map(link => link.record);
        else if (owner.data[constraintsKey] !== undefined) delete owner.data[constraintsKey];
      }
      for (const item of new Set(all.map(carrier))) {
        if (!targets.has(item)) delete item.data[idKey];
      }
      active = links.length > 0;
    }
    return true;
  }

  function captureTopology() {
    return active ? read() : [];
  }

  function rebindTopology(links, segments = new Map(), replacements = new Map()) {
    if (!links.length) return;
    const owners = new Set(links.map(link => link.owner));
    for (const segment of segments.values()) if (segment.path) owners.add(segment.path);
    for (const owner of owners) delete owner.data[constraintsKey];
    for (const link of links) {
      const from = segments.get(link.from) || link.from, to = segments.get(link.to) || link.to;
      if (!from.path?.isInserted() || from.path !== to.path || !lineHandles(from, to)) continue;
      if (!link.target) {
        if (tangentAtJoin(from, to)) add(from, to);
        continue;
      }
      const targets = replacements.get(link.target) || [link.target];
      const candidates = targets.filter(target => target.isInserted() && target.curves.length);
      let best = null;
      for (const target of candidates) {
        const point = positionAt(to), local = target.globalToLocal(point);
        const location = local && target.getNearestLocation(local);
        if (!location) continue;
        const distance = target.localToGlobal(location.point).getDistance(point);
        if (!best || distance < best.distance) best = { target, location, distance };
      }
      if (!best) continue;
      if (best.target === from.path) {
        if (tangentAtJoin(from, to)) add(from, to);
        continue;
      }
      add(from, to, best.location);
    }
  }

  function rekeyCopies(items) {
    const copies = items.flatMap(item => item instanceof paper.Path ? [item] : item.getItems({ class: paper.Path }));
    const ids = new Map();
    for (const item of new Set(copies.map(carrier))) {
      if (typeof item.data[idKey] === 'string') {
        const id = constraintPathId();
        ids.set(item.data[idKey], id);
        item.data[idKey] = id;
      }
    }
    for (const path of copies) {
      const links = records(path).flatMap(record => {
        if (record?.type === 'tangent-join') return [{ ...record }];
        const id = ids.get(record?.target?.id);
        return record?.type === 'tangent' && id ? [{ ...record, target: { ...record.target, id } }] : [];
      });
      if (links.length) {
        path.data[constraintsKey] = links;
        active = true;
      } else if (path.data[constraintsKey] !== undefined) delete path.data[constraintsKey];
    }
  }

  return {
    add, remove, solve, saveGeometry, restoreGeometry, captureTopology, rebindTopology, rekeyCopies,
    get active() { return active; },
    load() { active = paths().some(path => records(path).length > 0); },
    owns(path) { return records(path).length > 0; },
    drivenNodes(path) { return records(path).map(record => path.segments[record?.to]).filter(Boolean); }
  };
}
