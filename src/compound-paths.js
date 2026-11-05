import paper from 'paper';
import {resizeGeometry} from './resize-geometry.js';

// Paper draws transformed compound subpaths, but its fill winding test reads
// their raw curves. Bake only the subpath matrices into their geometry so
// painting, hit detection, and boolean operations use the same coordinates.
export function normalizeCompoundPaths(root){
 const compounds=root instanceof paper.CompoundPath?[root]:root.getItems({class:paper.CompoundPath});
 for(const compound of compounds)for(const child of compound.children){
  if(child.matrix.isIdentity())continue;
  const matrix=child.matrix.clone();child.matrix.reset();
  // Compound styles belong to the parent. Keep stroke widths and gradients,
  // and transform editable corner/source records along with the segments.
  resizeGeometry(child,matrix,false);
 }
}
