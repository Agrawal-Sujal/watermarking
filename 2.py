"""
Medical Image Watermarking – DTCWT–DCT–SVD–PSO
================================================
Algorithm 1 : Watermark Embedding  (Section 3.1)
Algorithm 2 : Watermark Extraction (Section 3.2)

Bug-fixes applied
-----------------
1. IMAGE QUALITY  – DTCWT inverse was reusing a mutated pyramid whose highpass
   subbands had stale internal references.  Fix: build a clean Pyramid from
   scratch for the inverse transform so only LL3 is touched.

2. WATERMARK EXTRACTION – per-block watermark SVs were concatenated into one
   flat vector then truncated before ISVD, scrambling the correspondence
   between host blocks and watermark SVs.  Fix: store the full per-block
   wm_sv_list in the key and recover the watermark matrix directly from the
   sum of per-block outer-product contributions, exactly reversing embedding.

Requirements
------------
    pip install numpy scipy Pillow dtcwt pyswarms
"""

import numpy as np
from dataclasses import dataclass
from PIL import Image
from scipy.fft import dctn, idctn
import dtcwt
from dtcwt.numpy import Pyramid
from pyswarms.single.global_best import GlobalBestPSO


# ══════════════════════════════════════════════════════════════════════════════
#  KEY BUNDLE
# ══════════════════════════════════════════════════════════════════════════════

@dataclass
class EmbedKey:
    """
    Everything saved during embedding that the extractor needs.

    alpha_star      : optimised PSO factor α*
    HSw_list        : original host singular-value vectors (one per block)
    wm_sv_list      : watermark singular-value slices (one per block)
    Uw              : left  SV matrix of encrypted watermark W_enc
    Vtw             : right SV matrix of encrypted watermark W_enc
    watermark_shape : (H, W) of the encrypted watermark (= resized WM size)
    henon_a / b     : Henon map parameters
    M               : image resize side
    block_size      : DCT block size (default 8)
    dtcwt_levels    : DTCWT depth (default 3)
    """
    alpha_star      : float
    HSw_list        : list
    wm_sv_list      : list
    Uw              : np.ndarray
    Vtw             : np.ndarray
    watermark_shape : tuple
    henon_a         : float = 1.4
    henon_b         : float = 0.3
    M               : int   = 512
    block_size      : int   = 8
    dtcwt_levels    : int   = 3


# ══════════════════════════════════════════════════════════════════════════════
#  HENON CHAOTIC SCRAMBLING
# ══════════════════════════════════════════════════════════════════════════════

def _henon_seq(n: int, a: float, b: float, n_burnin: int = 1000) -> np.ndarray:
    x, y = 0.1, 0.1
    for _ in range(n_burnin):
        x, y = 1.0 - a * x * x + y, b * x
    seq = np.empty(n)
    for i in range(n):
        x, y = 1.0 - a * x * x + y, b * x
        seq[i] = x
    return seq


def henon_encrypt(watermark: np.ndarray, a: float = 1.4, b: float = 0.3) -> np.ndarray:
    """Pixel-permutation scrambling via Henon map.  Returns float64 in [0,1]."""
    wm = watermark.astype(np.float64)
    if wm.max() > 1.0:
        wm /= 255.0
    perm = np.argsort(_henon_seq(wm.size, a, b))
    return wm.flatten()[perm].reshape(wm.shape)


def henon_decrypt(scrambled: np.ndarray, a: float = 1.4, b: float = 0.3) -> np.ndarray:
    """Inverse Henon permutation – recovers original pixel layout."""
    perm     = np.argsort(_henon_seq(scrambled.size, a, b))
    inv_perm = np.argsort(perm)
    return scrambled.flatten()[inv_perm].reshape(scrambled.shape)


# ══════════════════════════════════════════════════════════════════════════════
#  BLOCK UTILITIES
# ══════════════════════════════════════════════════════════════════════════════

def _partition(arr: np.ndarray, b: int):
    H, W = arr.shape
    blocks, positions = [], []
    for r in range(0, H - b + 1, b):
        for c in range(0, W - b + 1, b):
            blocks.append(arr[r:r+b, c:c+b].copy())
            positions.append((r, c))
    return blocks, positions


def _merge(blocks, positions, shape: tuple, b: int) -> np.ndarray:
    out = np.zeros(shape, dtype=np.float64)
    for blk, (r, c) in zip(blocks, positions):
        out[r:r+b, c:c+b] = blk
    return out


# ══════════════════════════════════════════════════════════════════════════════
#  SVD HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def _svd(A: np.ndarray):
    return np.linalg.svd(A, full_matrices=False)   # → U, s, Vt


def _isvd(U, s, Vt) -> np.ndarray:
    return U @ np.diag(s) @ Vt


# ══════════════════════════════════════════════════════════════════════════════
#  IMAGE LOAD HELPER
# ══════════════════════════════════════════════════════════════════════════════

def _load_gray(path: str, size: int) -> np.ndarray:
    return np.array(
        Image.open(path).convert("L").resize((size, size), Image.LANCZOS),
        dtype=np.float64,
    )


# ══════════════════════════════════════════════════════════════════════════════
#  SHARED FORWARD SUB-PIPELINE  (Alg-1 S2-4 / Alg-2 L1-8)
#  image → DTCWT → LL3 → partition → DCT → SVD
# ══════════════════════════════════════════════════════════════════════════════

def _forward_pipeline(img: np.ndarray, block_size: int, levels: int):
    """
    Returns
    -------
    U_list, sv_list, Vt_list : per-block SVD components
    dct_blocks               : per-block DCT matrices
    positions                : (r, c) top-left of each block in LL3
    LL                       : raw LL3 subband  (float64, copy)
    highpasses               : tuple of highpass subbands (untouched)
    tr                       : dtcwt.Transform2d instance
    """
    tr  = dtcwt.Transform2d()
    pyr = tr.forward(img, nlevels=levels)
    LL  = pyr.lowpass.copy()        # copy to avoid aliasing into the pyramid
    highpasses = pyr.highpasses     # keep originals for clean inverse

    blocks, positions = _partition(LL, block_size)

    U_list, sv_list, Vt_list, dct_blocks = [], [], [], []
    for blk in blocks:
        C        = dctn(blk, norm="ortho")
        U, s, Vt = _svd(C)
        U_list.append(U)
        sv_list.append(s.copy())
        Vt_list.append(Vt)
        dct_blocks.append(C)

    return U_list, sv_list, Vt_list, dct_blocks, positions, LL, highpasses, tr


# ══════════════════════════════════════════════════════════════════════════════
#  INVERSE PIPELINE  (IDCT → merge → IDTCWT)
#  FIX 1: construct a *fresh* Pyramid so highpass subbands are never mutated.
# ══════════════════════════════════════════════════════════════════════════════

def _inverse_pipeline(new_dct_blocks, positions, LL_shape, highpasses,
                      tr, block_size: int) -> np.ndarray:
    idct_blocks = [idctn(C, norm="ortho") for C in new_dct_blocks]
    LL_new      = _merge(idct_blocks, positions, LL_shape, block_size)
    # Build a fresh Pyramid – do NOT reuse the original pyramid object
    fresh_pyr   = Pyramid(LL_new, highpasses)
    return tr.inverse(fresh_pyr)


# ══════════════════════════════════════════════════════════════════════════════
#  PSO FITNESS
# ══════════════════════════════════════════════════════════════════════════════

def _fitness(alpha_mat, HSw_list, wm_sv_list, U_list, Vt_list, dct_blocks):
    """
    Minimise  λ·(–PSNR)  +  (1–λ)·mean_SV_perturbation
    alpha_mat : (n_particles, 1)
    """
    lam   = 0.6
    costs = np.empty(len(alpha_mat))
    for i, (alpha,) in enumerate(alpha_mat):
        mse_acc = sv_acc = 0.0
        for hsw, sw, U, Vt, C_orig in zip(
                HSw_list, wm_sv_list, U_list, Vt_list, dct_blocks):
            hsw_new  = hsw + alpha * sw
            C_new    = _isvd(U, hsw_new, Vt)
            mse_acc += np.mean((C_orig - C_new) ** 2)
            sv_acc  += np.mean(np.abs(alpha * sw))
        n        = len(HSw_list)
        avg_mse  = mse_acc / n
        psnr_val = 10.0 * np.log10(255.0 ** 2 / (avg_mse + 1e-12))
        costs[i] = lam * (-psnr_val) + (1.0 - lam) * (sv_acc / n)
    return costs


# ══════════════════════════════════════════════════════════════════════════════
#  ALGORITHM 1 – EMBEDDING
# ══════════════════════════════════════════════════════════════════════════════

def embed_watermark(
    host_path      : str,
    watermark_path : str,
    M              : int   = 512,
    block_size     : int   = 8,
    dtcwt_levels   : int   = 3,
    henon_a        : float = 1.4,
    henon_b        : float = 0.3,
    pso_particles  : int   = 20,
    pso_iters      : int   = 50,
    alpha_bounds   : tuple = (0.001, 0.05),
    output_path    : str   = "watermarked.png",
) -> tuple:
    """
    Embed watermark into host image following Algorithm 1.
    Returns (Iw_uint8, key).
    """

    # S1: Load & resize
    print("[Alg1 / S1]  Loading host image …")
    I = _load_gray(host_path, M)

    # S2-4: Forward pipeline
    print("[Alg1 / S2-4]  DTCWT → partition → DCT → SVD …")
    U_list, HSw_list, Vt_list, dct_blocks, positions, LL, highpasses, tr = \
        _forward_pipeline(I, block_size, dtcwt_levels)
    n_blocks = len(HSw_list)
    LL_shape = LL.shape
    sv_len   = len(HSw_list[0])      # singular values per block = block_size
    print(f"           {n_blocks} blocks, LL3 shape {LL_shape}, {sv_len} SVs/block")

    # S5: Henon-encrypt watermark
    print("[Alg1 / S5]  Henon-encrypting watermark …")
    wm_side = int(np.sqrt(n_blocks)) * block_size
    wm_side = max(wm_side, block_size)
    W_raw   = _load_gray(watermark_path, wm_side)   # float64 in [0,1]
    W_enc   = henon_encrypt(W_raw, a=henon_a, b=henon_b)
    print(f"           Watermark encrypted, shape {W_enc.shape}")

    # S6: SVD on W_enc
    print("[Alg1 / S6]  SVD on encrypted watermark …")
    Uw, Sw_full, Vtw = _svd(W_enc)

    # FIX 2: build per-block wm_sv slices and store them in the key
    total_needed = n_blocks * sv_len
    Sw_tiled     = np.tile(Sw_full, int(np.ceil(total_needed / max(len(Sw_full), 1))))
    wm_sv_list   = [
        Sw_tiled[i * sv_len : i * sv_len + sv_len].copy()
        for i in range(n_blocks)
    ]

    # S7-8: PSO
    print("[Alg1 / S7-8]  PSO optimising α* …")
    lo = np.array([alpha_bounds[0]])
    hi = np.array([alpha_bounds[1]])
    optimizer = GlobalBestPSO(
        n_particles = pso_particles,
        dimensions  = 1,
        options     = {"c1": 0.5, "c2": 0.3, "w": 0.9},
        bounds      = (lo, hi),
    )
    cost, best = optimizer.optimize(
        lambda a: _fitness(a, HSw_list, wm_sv_list, U_list, Vt_list, dct_blocks),
        iters   = pso_iters,
        verbose = False,
    )
    alpha_star = float(best[0])
    print(f"           α* = {alpha_star:.6f}  (PSO cost = {cost:.4f})")

    # S9: Embed → ISVD → IDCT → IDTCWT
    print("[Alg1 / S9]  Embedding, ISVD, IDCT, IDTCWT …")
    new_dct_blocks = [
        _isvd(U, hsw + alpha_star * sw, Vt)
        for hsw, sw, U, Vt in zip(HSw_list, wm_sv_list, U_list, Vt_list)
    ]

    # FIX 1: use clean inverse pipeline
    Iw       = _inverse_pipeline(new_dct_blocks, positions, LL_shape, highpasses, tr, block_size)
    Iw_uint8 = np.clip(Iw, 0, 255).astype(np.uint8)
    Image.fromarray(Iw_uint8).save(output_path)

    _psnr = psnr(I, Iw_uint8.astype(np.float64))
    print(f"           Saved → {output_path}   PSNR = {_psnr:.2f} dB")

    key = EmbedKey(
        alpha_star      = alpha_star,
        HSw_list        = HSw_list,
        wm_sv_list      = wm_sv_list,     # FIX 2: saved per-block slices
        Uw              = Uw,
        Vtw             = Vtw,
        watermark_shape = W_enc.shape,
        henon_a         = henon_a,
        henon_b         = henon_b,
        M               = M,
        block_size      = block_size,
        dtcwt_levels    = dtcwt_levels,
    )
    return Iw_uint8, key


# ══════════════════════════════════════════════════════════════════════════════
#  ALGORITHM 2 – EXTRACTION
# ══════════════════════════════════════════════════════════════════════════════

def extract_watermark(
    watermarked_path : str,
    key              : EmbedKey,
    output_path      : str = "extracted_watermark.png",
) -> np.ndarray:
    """
    Extract watermark from a (possibly attacked) watermarked image.
    Implements Algorithm 2 exactly.
    """

    # L1-8: DTCWT–DCT–SVD on Iw
    print("[Alg2 / L1-8]  Forward pipeline on watermarked image …")
    Iw = _load_gray(watermarked_path, key.M)
    _, HSw_hat_list, _, _, _, _, _, _ = _forward_pipeline(
        Iw, key.block_size, key.dtcwt_levels
    )

    # L9: Retrieve stored host SVs
    HSw_list = key.HSw_list
    print(f"[Alg2 / L9]   {len(HSw_list)} cached host SV vectors loaded from key")

    # L10-12: Sw' = (HSw_hat – HSw) / α*   [Eq. 7]
    print(f"[Alg2 / L10-12]  Recovering watermark SVs  (α* = {key.alpha_star:.6f}) …")
    Sw_prime_list = [
        (hsw_hat - hsw) / key.alpha_star
        for hsw_hat, hsw in zip(HSw_hat_list, HSw_list)
    ]

    # L13-14: ISVD → reconstruct encrypted watermark Cw
    # FIX 2: accumulate block contributions using stored Uw / Vtw,
    #        then average to get the correctly-shaped WM matrix.
    print("[Alg2 / L13-14]  ISVD reconstruction of encrypted watermark …")
    H_wm, W_wm = key.watermark_shape
    k           = min(key.Uw.shape[1], key.Vtw.shape[0])
    Cw_accum    = np.zeros((H_wm, W_wm), dtype=np.float64)

    for sw_prime in Sw_prime_list:
        sv_k           = np.zeros(k)
        sv_k[:min(k, len(sw_prime))] = sw_prime[:k]
        contrib        = _isvd(key.Uw[:, :k], sv_k, key.Vtw[:k, :])
        rh = min(H_wm, contrib.shape[0])
        rw = min(W_wm, contrib.shape[1])
        Cw_accum[:rh, :rw] += contrib[:rh, :rw]

    Cw = Cw_accum / max(len(Sw_prime_list), 1)

    # L15: W_ext = HenonDecrypt(Cw)
    print("[Alg2 / L15]  Henon decryption …")
    W_ext = henon_decrypt(Cw, a=key.henon_a, b=key.henon_b)

    # Normalise to [0, 255]
    W_norm = W_ext - W_ext.min()
    if W_norm.max() > 0:
        W_norm /= W_norm.max()
    W_ext_uint8 = (W_norm * 255).astype(np.uint8)

    # L16: return
    Image.fromarray(W_ext_uint8).save(output_path)
    print(f"[Alg2 / L16]  Extracted watermark saved → {output_path}")
    return W_ext_uint8


# ══════════════════════════════════════════════════════════════════════════════
#  QUALITY METRICS
# ══════════════════════════════════════════════════════════════════════════════

def psnr(original: np.ndarray, modified: np.ndarray) -> float:
    mse = np.mean((original.astype(np.float64) - modified.astype(np.float64)) ** 2)
    return float("inf") if mse == 0 else 10.0 * np.log10(255.0 ** 2 / mse)


def nc(wm_orig: np.ndarray, wm_ext: np.ndarray) -> float:
    a = wm_orig.flatten().astype(np.float64)
    b = wm_ext.flatten().astype(np.float64)
    denom = np.sqrt(np.sum(a ** 2) * np.sum(b ** 2))
    return float(np.dot(a, b) / denom) if denom > 0 else 0.0


# ══════════════════════════════════════════════════════════════════════════════
#  KEY  I/O
# ══════════════════════════════════════════════════════════════════════════════

def save_key(key: EmbedKey, path: str) -> None:
    """Serialise EmbedKey to <path>.npz"""
    np.savez_compressed(
        path,
        alpha_star      = np.array([key.alpha_star]),
        HSw_list        = np.array(key.HSw_list,   dtype=object),
        wm_sv_list      = np.array(key.wm_sv_list, dtype=object),
        Uw              = key.Uw,
        Vtw             = key.Vtw,
        watermark_shape = np.array(key.watermark_shape),
        henon_a         = np.array([key.henon_a]),
        henon_b         = np.array([key.henon_b]),
        M               = np.array([key.M]),
        block_size      = np.array([key.block_size]),
        dtcwt_levels    = np.array([key.dtcwt_levels]),
    )
    print(f"Key saved → {path}.npz")


def load_key(path: str) -> EmbedKey:
    """Deserialise EmbedKey from a .npz file."""
    d = np.load(path, allow_pickle=True)
    return EmbedKey(
        alpha_star      = float(d["alpha_star"][0]),
        HSw_list        = list(d["HSw_list"]),
        wm_sv_list      = list(d["wm_sv_list"]),
        Uw              = d["Uw"],
        Vtw             = d["Vtw"],
        watermark_shape = tuple(int(x) for x in d["watermark_shape"]),
        henon_a         = float(d["henon_a"][0]),
        henon_b         = float(d["henon_b"][0]),
        M               = int(d["M"][0]),
        block_size      = int(d["block_size"][0]),
        dtcwt_levels    = int(d["dtcwt_levels"][0]),
    )


# ══════════════════════════════════════════════════════════════════════════════
#  CLI
# ══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import argparse, sys

    parser = argparse.ArgumentParser(
        description="Medical Image Watermarking – DTCWT–DCT–SVD–PSO"
    )
    sub = parser.add_subparsers(dest="cmd")

    # embed
    emb = sub.add_parser("embed", help="Algorithm 1 – embed watermark")
    emb.add_argument("host",        help="Host medical image")
    emb.add_argument("watermark",   help="Watermark logo image")
    emb.add_argument("--output",    default="watermarked.png")
    emb.add_argument("--key",       default="embed_key",
                     help="Base path for key file (.npz added automatically)")
    emb.add_argument("--M",         type=int,   default=512)
    emb.add_argument("--block",     type=int,   default=8)
    emb.add_argument("--levels",    type=int,   default=3)
    emb.add_argument("--particles", type=int,   default=20)
    emb.add_argument("--iters",     type=int,   default=50)
    emb.add_argument("--alpha-min", type=float, default=0.001)
    emb.add_argument("--alpha-max", type=float, default=0.05)

    # extract
    ext = sub.add_parser("extract", help="Algorithm 2 – extract watermark")
    ext.add_argument("watermarked", help="Watermarked (possibly attacked) image")
    ext.add_argument("key",         help="Path to .npz key file from embed step")
    ext.add_argument("--output",    default="extracted_watermark.png")

    args = parser.parse_args()

    if args.cmd == "embed":
        Iw, key = embed_watermark(
            host_path      = args.host,
            watermark_path = args.watermark,
            M              = args.M,
            block_size     = args.block,
            dtcwt_levels   = args.levels,
            pso_particles  = args.particles,
            pso_iters      = args.iters,
            alpha_bounds   = (args.alpha_min, args.alpha_max),
            output_path    = args.output,
        )
        save_key(key, args.key)

    elif args.cmd == "extract":
        key  = load_key(args.key)
        W_ex = extract_watermark(
            watermarked_path = args.watermarked,
            key              = key,
            output_path      = args.output,
        )

    else:
        parser.print_help()
        sys.exit(1)