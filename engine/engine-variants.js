// Large weights remain on the CDN. The studio stores each variant separately.
export const STOCKFISH_VARIANTS = {
  lite: { name: 'Stockfish 19 Lite', key: 'sf19lite' },
  standard: {
    name: 'Stockfish 19', key: 'sf19standard-v1',
    wasmUrl: 'https://weights.4chess.cc/engines/stockfish-19-standard-v1.wasm',
    bytes: 99102793
  }
};

export const MAIA_VARIANTS = {
  '5m': { name: 'Maia-3 5M', key: 'maia3-5m', url: 'https://weights.4chess.cc/maia3_model.bin', expected: { dim_vit: 256, num_heads: 8, num_blocks: 8, total_params: 7327236 } },
  '23m': {
    name: 'Maia-3 23M', key: 'maia3-23m-fp32-v1',
    url: 'https://weights.4chess.cc/maia3_23m.bin',
    expected: { dim_vit: 512, num_heads: 16, num_blocks: 8, total_params: 27130884 }
  },
  '79m': {
    name: 'Maia-3 79M', key: 'maia3-79m-fp16-v1',
    url: 'https://weights.4chess.cc/maia3_79m_fp16_v1.bin',
    expected: { dim_vit: 1024, num_heads: 32, num_blocks: 8, total_params: 83094020 }
  }
};
