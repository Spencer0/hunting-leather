import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';
import fs from 'fs'; import path from 'path';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const verbose = process.argv[2] === '-v'; const files = process.argv.slice(verbose ? 3 : 2);
for (const f of files) {
  const doc = await io.read(f); const root = doc.getRoot(); const sc = root.listScenes()[0];
  const b = getBounds(sc); const s = b.max.map((v, i) => (v - b.min[i]).toFixed(2));
  const prims = root.listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + (p.getIndices()?.getCount() ?? 0) / 3, 0), 0);
  console.log(path.basename(f), 'size', s.join('x'), 'min', b.min.map(v => v.toFixed(2)).join(','), 'tris', prims, 'mats', root.listMaterials().map(m => m.getName() + (m.getAlphaMode() !== 'OPAQUE' ? '[' + m.getAlphaMode() + ']' : '') + (m.getBaseColorTexture() ? '(tex)' : '')).join(' '));
  if (verbose) console.log('  nodes:', root.listNodes().map(n => n.getName()).join(' '));
}
