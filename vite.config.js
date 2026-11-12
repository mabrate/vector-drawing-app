import { defineConfig } from 'vite';
export default defineConfig({
  base:'./',
  // Discover lazy CAD/viewer dependencies before opening a model, so the dev
  // optimizer cannot reload the page in the middle of an unapplied preview.
  optimizeDeps:{include:['three','three/addons/controls/OrbitControls.js','three/src/extras/Earcut.js','replicad','replicad-opencascadejs']}
});
