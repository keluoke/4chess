#include <wasm_simd128.h>

static inline float hsum_f32x4(v128_t v) {
  v128_t shuf = wasm_i32x4_shuffle(v, v, 2, 3, 0, 1);
  v128_t sums = wasm_f32x4_add(v, shuf);
  shuf = wasm_i32x4_shuffle(sums, sums, 1, 0, 3, 2);
  sums = wasm_f32x4_add(sums, shuf);
  return wasm_f32x4_extract_lane(sums, 0);
}

static inline float dot_f32(const float* a, const float* b, int K) {
  v128_t acc = wasm_f32x4_splat(0.0f);
  int k = 0;
  for (; k + 4 <= K; k += 4) {
    acc = wasm_f32x4_add(acc, wasm_f32x4_mul(wasm_v128_load(a + k), wasm_v128_load(b + k)));
  }
  float sum = hsum_f32x4(acc);
  for (; k < K; k++) sum += a[k] * b[k];
  return sum;
}

static inline void sgemm_nt_core(
    float* out, const float* A, const float* B, const float* bias,
    int M, int N, int K, int flags, float scale) {
  const int add_residual = flags & 1;
  const int add_bias = flags & 2;

  int i = 0;
  for (; i + 2 <= M; i += 2) {
    const float* a0 = A + i * K;
    const float* a1 = a0 + K;
    float* o0 = out + i * N;
    float* o1 = o0 + N;

    int j = 0;
    for (; j + 4 <= N; j += 4) {
      const float* b0 = B + j * K;
      const float* b1 = b0 + K;
      const float* b2 = b1 + K;
      const float* b3 = b2 + K;

      v128_t c00 = wasm_f32x4_splat(0.0f);
      v128_t c01 = wasm_f32x4_splat(0.0f);
      v128_t c02 = wasm_f32x4_splat(0.0f);
      v128_t c03 = wasm_f32x4_splat(0.0f);
      v128_t c10 = wasm_f32x4_splat(0.0f);
      v128_t c11 = wasm_f32x4_splat(0.0f);
      v128_t c12 = wasm_f32x4_splat(0.0f);
      v128_t c13 = wasm_f32x4_splat(0.0f);

      int k = 0;
      for (; k + 4 <= K; k += 4) {
        v128_t va0 = wasm_v128_load(a0 + k);
        v128_t va1 = wasm_v128_load(a1 + k);
        v128_t vb0 = wasm_v128_load(b0 + k);
        v128_t vb1 = wasm_v128_load(b1 + k);
        v128_t vb2 = wasm_v128_load(b2 + k);
        v128_t vb3 = wasm_v128_load(b3 + k);

        c00 = wasm_f32x4_add(c00, wasm_f32x4_mul(va0, vb0));
        c01 = wasm_f32x4_add(c01, wasm_f32x4_mul(va0, vb1));
        c02 = wasm_f32x4_add(c02, wasm_f32x4_mul(va0, vb2));
        c03 = wasm_f32x4_add(c03, wasm_f32x4_mul(va0, vb3));
        c10 = wasm_f32x4_add(c10, wasm_f32x4_mul(va1, vb0));
        c11 = wasm_f32x4_add(c11, wasm_f32x4_mul(va1, vb1));
        c12 = wasm_f32x4_add(c12, wasm_f32x4_mul(va1, vb2));
        c13 = wasm_f32x4_add(c13, wasm_f32x4_mul(va1, vb3));
      }

      float s00 = hsum_f32x4(c00);
      float s01 = hsum_f32x4(c01);
      float s02 = hsum_f32x4(c02);
      float s03 = hsum_f32x4(c03);
      float s10 = hsum_f32x4(c10);
      float s11 = hsum_f32x4(c11);
      float s12 = hsum_f32x4(c12);
      float s13 = hsum_f32x4(c13);

      for (; k < K; k++) {
        float va0s = a0[k], va1s = a1[k];
        float vb0s = b0[k], vb1s = b1[k], vb2s = b2[k], vb3s = b3[k];
        s00 += va0s * vb0s; s01 += va0s * vb1s; s02 += va0s * vb2s; s03 += va0s * vb3s;
        s10 += va1s * vb0s; s11 += va1s * vb1s; s12 += va1s * vb2s; s13 += va1s * vb3s;
      }

      s00 *= scale; s01 *= scale; s02 *= scale; s03 *= scale;
      s10 *= scale; s11 *= scale; s12 *= scale; s13 *= scale;

      if (add_bias) {
        float bi0 = bias[j], bi1 = bias[j + 1], bi2 = bias[j + 2], bi3 = bias[j + 3];
        s00 += bi0; s01 += bi1; s02 += bi2; s03 += bi3;
        s10 += bi0; s11 += bi1; s12 += bi2; s13 += bi3;
      }
      if (add_residual) {
        s00 += o0[j]; s01 += o0[j + 1]; s02 += o0[j + 2]; s03 += o0[j + 3];
        s10 += o1[j]; s11 += o1[j + 1]; s12 += o1[j + 2]; s13 += o1[j + 3];
      }

      o0[j] = s00; o0[j + 1] = s01; o0[j + 2] = s02; o0[j + 3] = s03;
      o1[j] = s10; o1[j + 1] = s11; o1[j + 2] = s12; o1[j + 3] = s13;
    }

    for (; j < N; j++) {
      const float* bj = B + j * K;
      v128_t c0 = wasm_f32x4_splat(0.0f);
      v128_t c1 = wasm_f32x4_splat(0.0f);
      int k = 0;
      for (; k + 4 <= K; k += 4) {
        v128_t vb = wasm_v128_load(bj + k);
        c0 = wasm_f32x4_add(c0, wasm_f32x4_mul(wasm_v128_load(a0 + k), vb));
        c1 = wasm_f32x4_add(c1, wasm_f32x4_mul(wasm_v128_load(a1 + k), vb));
      }
      float s0 = hsum_f32x4(c0);
      float s1 = hsum_f32x4(c1);
      for (; k < K; k++) {
        float vbs = bj[k];
        s0 += a0[k] * vbs;
        s1 += a1[k] * vbs;
      }
      s0 *= scale;
      s1 *= scale;
      if (add_bias) {
        float bi = bias[j];
        s0 += bi;
        s1 += bi;
      }
      if (add_residual) {
        s0 += o0[j];
        s1 += o1[j];
      }
      o0[j] = s0;
      o1[j] = s1;
    }
  }

  for (; i < M; i++) {
    const float* a0 = A + i * K;
    float* o0 = out + i * N;
    int j = 0;
    for (; j + 4 <= N; j += 4) {
      const float* b0 = B + j * K;
      const float* b1 = b0 + K;
      const float* b2 = b1 + K;
      const float* b3 = b2 + K;

      v128_t c0 = wasm_f32x4_splat(0.0f);
      v128_t c1 = wasm_f32x4_splat(0.0f);
      v128_t c2 = wasm_f32x4_splat(0.0f);
      v128_t c3 = wasm_f32x4_splat(0.0f);
      int k = 0;
      for (; k + 4 <= K; k += 4) {
        v128_t va = wasm_v128_load(a0 + k);
        c0 = wasm_f32x4_add(c0, wasm_f32x4_mul(va, wasm_v128_load(b0 + k)));
        c1 = wasm_f32x4_add(c1, wasm_f32x4_mul(va, wasm_v128_load(b1 + k)));
        c2 = wasm_f32x4_add(c2, wasm_f32x4_mul(va, wasm_v128_load(b2 + k)));
        c3 = wasm_f32x4_add(c3, wasm_f32x4_mul(va, wasm_v128_load(b3 + k)));
      }
      float s0 = hsum_f32x4(c0);
      float s1 = hsum_f32x4(c1);
      float s2 = hsum_f32x4(c2);
      float s3 = hsum_f32x4(c3);
      for (; k < K; k++) {
        float va = a0[k];
        s0 += va * b0[k]; s1 += va * b1[k]; s2 += va * b2[k]; s3 += va * b3[k];
      }
      s0 *= scale; s1 *= scale; s2 *= scale; s3 *= scale;
      if (add_bias) {
        s0 += bias[j]; s1 += bias[j + 1]; s2 += bias[j + 2]; s3 += bias[j + 3];
      }
      if (add_residual) {
        s0 += o0[j]; s1 += o0[j + 1]; s2 += o0[j + 2]; s3 += o0[j + 3];
      }
      o0[j] = s0; o0[j + 1] = s1; o0[j + 2] = s2; o0[j + 3] = s3;
    }
    for (; j < N; j++) {
      float s = dot_f32(a0, B + j * K, K) * scale;
      if (add_bias) s += bias[j];
      if (add_residual) s += o0[j];
      o0[j] = s;
    }
  }
}

void sgemm_nt(float* out, const float* A, const float* B, const float* bias, int M, int N, int K, int flags) {
  sgemm_nt_core(out, A, B, bias, M, N, K, flags, 1.0f);
}

void sgemm_nt_scale(float* out, const float* A, const float* B, int M, int N, int K, float scale) {
  sgemm_nt_core(out, A, B, 0, M, N, K, 0, scale);
}

void mha_head_qk(float* scores, const float* Q, const float* K, const float* gabBias, int D, int hOffset, int headDim, float scale) {
  for (int i = 0; i < 64; i += 2) {
    const float* q0 = Q + i * D + hOffset;
    const float* q1 = q0 + D;
    float* s0 = scores + i * 64;
    float* s1 = s0 + 64;
    const float* g0 = gabBias + i * 64;
    const float* g1 = g0 + 64;

    for (int j = 0; j < 64; j += 4) {
      const float* k0 = K + j * D + hOffset;
      const float* k1 = k0 + D;
      const float* k2 = k1 + D;
      const float* k3 = k2 + D;

      v128_t c00 = wasm_f32x4_splat(0.0f);
      v128_t c01 = wasm_f32x4_splat(0.0f);
      v128_t c02 = wasm_f32x4_splat(0.0f);
      v128_t c03 = wasm_f32x4_splat(0.0f);
      v128_t c10 = wasm_f32x4_splat(0.0f);
      v128_t c11 = wasm_f32x4_splat(0.0f);
      v128_t c12 = wasm_f32x4_splat(0.0f);
      v128_t c13 = wasm_f32x4_splat(0.0f);

      int k = 0;
      for (; k + 4 <= headDim; k += 4) {
        v128_t vq0 = wasm_v128_load(q0 + k);
        v128_t vq1 = wasm_v128_load(q1 + k);
        v128_t vk0 = wasm_v128_load(k0 + k);
        v128_t vk1 = wasm_v128_load(k1 + k);
        v128_t vk2 = wasm_v128_load(k2 + k);
        v128_t vk3 = wasm_v128_load(k3 + k);

        c00 = wasm_f32x4_add(c00, wasm_f32x4_mul(vq0, vk0));
        c01 = wasm_f32x4_add(c01, wasm_f32x4_mul(vq0, vk1));
        c02 = wasm_f32x4_add(c02, wasm_f32x4_mul(vq0, vk2));
        c03 = wasm_f32x4_add(c03, wasm_f32x4_mul(vq0, vk3));
        c10 = wasm_f32x4_add(c10, wasm_f32x4_mul(vq1, vk0));
        c11 = wasm_f32x4_add(c11, wasm_f32x4_mul(vq1, vk1));
        c12 = wasm_f32x4_add(c12, wasm_f32x4_mul(vq1, vk2));
        c13 = wasm_f32x4_add(c13, wasm_f32x4_mul(vq1, vk3));
      }

      float r00 = hsum_f32x4(c00);
      float r01 = hsum_f32x4(c01);
      float r02 = hsum_f32x4(c02);
      float r03 = hsum_f32x4(c03);
      float r10 = hsum_f32x4(c10);
      float r11 = hsum_f32x4(c11);
      float r12 = hsum_f32x4(c12);
      float r13 = hsum_f32x4(c13);

      for (; k < headDim; k++) {
        float vq0s = q0[k], vq1s = q1[k];
        float vk0s = k0[k], vk1s = k1[k], vk2s = k2[k], vk3s = k3[k];
        r00 += vq0s * vk0s; r01 += vq0s * vk1s; r02 += vq0s * vk2s; r03 += vq0s * vk3s;
        r10 += vq1s * vk0s; r11 += vq1s * vk1s; r12 += vq1s * vk2s; r13 += vq1s * vk3s;
      }

      s0[j]     = r00 * scale + g0[j];
      s0[j + 1] = r01 * scale + g0[j + 1];
      s0[j + 2] = r02 * scale + g0[j + 2];
      s0[j + 3] = r03 * scale + g0[j + 3];
      s1[j]     = r10 * scale + g1[j];
      s1[j + 1] = r11 * scale + g1[j + 1];
      s1[j + 2] = r12 * scale + g1[j + 2];
      s1[j + 3] = r13 * scale + g1[j + 3];
    }
  }
}

void mha_head_av(float* saOut, const float* attn, const float* V, int D, int hOffset, int headDim) {
  for (int i = 0; i < 64; i++) {
    const float* ai = attn + i * 64;
    float* out = saOut + i * D + hOffset;
    int k = 0;
    for (; k + 4 <= headDim; k += 4) {
      v128_t acc = wasm_f32x4_splat(0.0f);
      const float* vj = V + hOffset + k;
      for (int j = 0; j < 64; j++) {
        v128_t wa = wasm_f32x4_splat(ai[j]);
        acc = wasm_f32x4_add(acc, wasm_f32x4_mul(wa, wasm_v128_load(vj)));
        vj += D;
      }
      wasm_v128_store(out + k, acc);
    }
    for (; k < headDim; k++) {
      float sum = 0.0f;
      const float* vj = V + hOffset + k;
      for (int j = 0; j < 64; j++) {
        sum += ai[j] * (*vj);
        vj += D;
      }
      out[k] = sum;
    }
  }
}
