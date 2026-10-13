// Which execution provider is actually faster on this machine?
import { launchHead as launch, sleep } from './cdp-head.mjs';
const B = await launch({ port: 9358, profile: 'cdp-bench-gpu', url: 'http://localhost:4477/', scratch: import.meta.dirname });
await sleep(1200);
const r = await B.evaluate(`(async () => {
  const ort = await import('/vendor/ort/ort.webgpu.bundle.min.mjs');
  ort.env.wasm.wasmPaths = '/vendor/ort/';
  ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(8,(navigator.hardwareConcurrency||4)-1) : 1;
  ort.env.logLevel = 'error';
  const out = { threads: ort.env.wasm.numThreads, cores: navigator.hardwareConcurrency, iso: self.crossOriginIsolated };
  for (const [name, path, size] of [['fast','/models/u2netp.onnx',320], ['hq','/models/rmbg14-q.onnx',1024]]) {
    for (const ep of ['webgpu','wasm']) {
      try {
        const t0 = performance.now();
        const s = await ort.InferenceSession.create(path, { executionProviders:[ep], graphOptimizationLevel:'all' });
        const load = performance.now()-t0;
        const data = new Float32Array(3*size*size).map(() => Math.random());
        const runs = [];
        for (let i=0;i<3;i++) {
          const t = performance.now();
          await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', data, [1,3,size,size]) });
          runs.push(Math.round(performance.now()-t));
        }
        await s.release();
        out[name+'/'+ep] = { load: Math.round(load), runs };
      } catch(e) { out[name+'/'+ep] = 'FAIL ' + String(e.message).slice(0,120); }
    }
  }
  return out;
})()`);
console.log(JSON.stringify(r, null, 2));
B.close();
