/**
 * Maia-3 Custom ONNX Model Loader
 * Enables loading custom ONNX models (e.g., Maia-3 5M, 23M, 79M from Hugging Face or local files)
 * directly into ONNX Runtime Web with WebGPU or WebAssembly execution providers.
 */

export class ModelLoader {
  static async loadFromUrl(url, executionProvider = 'webgpu') {
    if (typeof window === 'undefined' || !window.ort) {
      throw new Error('ONNX Runtime Web (ort) is not loaded.');
    }

    const options = {
      executionProviders: [executionProvider, 'wasm'],
      graphOptimizationLevel: 'all'
    };

    console.log(`[Maia-3 Loader] Loading ONNX model from ${url} with provider ${executionProvider}...`);
    const session = await window.ort.InferenceSession.create(url, options);
    console.log('[Maia-3 Loader] ONNX Session successfully created!');
    return session;
  }

  static async loadFromFile(file, executionProvider = 'webgpu') {
    const arrayBuffer = await file.arrayBuffer();
    const options = {
      executionProviders: [executionProvider, 'wasm'],
      graphOptimizationLevel: 'all'
    };

    console.log(`[Maia-3 Loader] Loading ONNX model from file (${(file.size / (1024 * 1024)).toFixed(1)} MB)...`);
    const session = await window.ort.InferenceSession.create(new Uint8Array(arrayBuffer), options);
    console.log('[Maia-3 Loader] Custom model loaded successfully!');
    return session;
  }
}
