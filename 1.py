"""
Medical Image Watermarking – DTCWT–DCT–SVD–PSO
================================================
Algorithm 1 : Watermark Embedding  (Section 3.1)
Algorithm 2 : Watermark Extraction (Section 3.2)

Requirements
------------
    pip install numpy scipy Pillow dtcwt pyswarms
"""

import numpy as np
from dataclasses import dataclass
from pathlib import Path
from PIL import Image
from scipy.fft import dctn, idctn
import dtcwt
from pyswarms.single.global_best import GlobalBestPSO


# ══════════════════════════════════════════════════════════════════════════════
#  KEY BUNDLE  – everything that must be saved / passed to the extractor
# ══════════════════════════════════════════════════════════════════════════════

@dataclass
class EmbedKey:
    """
    All secret / stored values produced during embedding.
    Pass this object directly to extract_watermark().

    Fields
    ------
    alpha_star   : optimised PSO embedding factor α*
    HSw_list     : list of original host singular-value vectors (one per block)
    Uw           : left  singular vectors of the encrypted watermark  (U_w)
    Vtw          : right singular vectors of the encrypted watermark  (V_w^T)
    watermark_shape : (H, W) of the original watermark logo
    henon_a / b  : Henon map parameters
    M            : image resize target used during embedding
    block_size   : DCT block size
    dtcwt_levels : DTCWT decomposition depth
    """
    alpha_star      : float
    HSw_list        : list          # list[np.ndarray]  – original host SVs per block
    Uw              : np.ndarray    # (N, k)
    Vtw             : np.ndarray    # (k, N)
    watermark_shape : tuple         # (H, W)
    henon_a         : float = 1.4
    henon_b         : float = 0.3
    M               : int   = 512
    block_size      : int   = 8
    dtcwt_levels    : int   = 3


# ══════════════════════════════════════════════════════════════════════════════
#  HENON CHAOTIC SCRAMBLING
# ══════════════════════════════════════════════════════════════════════════════

def _henon_seq(n: int, a: float, b: float, n_burnin: int = 1000) -> np.ndarray:
    """Generate n values of the Henon chaotic map (after burn-in)."""
    x, y = 0.1, 0.1
    for _ in range(n_burnin):
        x, y = 1.0 - a * x * x + y, b * x
    seq = np.empty(n)
    for i in range(n):
        x, y = 1.0 - a * x * x + y, b * x
        seq[i] = x
    return seq


def henon_encrypt(watermark: np.ndarray,
                  a: float = 1.4, b: float = 0.3) -> np.ndarray:
    """
    Scramble a 2-D watermark using Henon chaotic permutation.

    Returns float64 array in [0, 1].
    """
    wm = watermark.astype(np.float64)
    if wm.max() > 1.0:
        wm /= 255.0
    perm = np.argsort(_henon_seq(wm.size, a, b))
    return wm.flatten()[perm].reshape(wm.shape)


def henon_decrypt(scrambled: np.ndarray,
                  a: float = 1.4, b: float = 0.3) -> np.ndarray:
    """Inverse of henon_encrypt."""
    perm     = np.argsort(_henon_seq(scrambled.size, a, b))
    inv_perm = np.argsort(perm)
    return scrambled.flatten()[inv_perm].reshape(scrambled.shape)


# ══════════════════════════════════════════════════════════════════════════════
#  BLOCK UTILITIES
# ══════════════════════════════════════════════════════════════════════════════

def _partition(arr: np.ndarray, b: int):
    """Non-overlapping b×b block split.  Returns (blocks, positions)."""
    H, W   = arr.shape
    blocks, positions = [], []
    for r in range(0, H - b + 1, b):
        for c in range(0, W - b + 1, b):
            blocks.append(arr[r:r+b, c:c+b].copy())
            positions.append((r, c))
    return blocks, positions


def _merge(blocks, positions, shape, b: int) -> np.ndarray:
    """Reassemble blocks into an array of given shape."""
    out = np.zeros(shape, dtype=np.float64)
    for blk, (r, c) in zip(blocks, positions):
        out[r:r+b, c:c+b] = blk
    return out


# ══════════════════════════════════════════════════════════════════════════════
#  SVD HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def _svd(block: np.ndarray):
    return np.linalg.svd(block, full_matrices=False)     # → U, s, Vt


def _isvd(U, s, Vt) -> np.ndarray:
    return U @ np.diag(s) @ Vt


# ══════════════════════════════════════════════════════════════════════════════
#  SHARED SUB-PIPELINE  (Alg-1 steps 2-4 / Alg-2 lines 1-8)
#      image → DTCWT → LL3 → partition → DCT → SVD
# ══════════════════════════════════════════════════════════════════════════════

def _dtcwt_dct_svd(img_path: str, M: int, block_size: int, levels: int):
    """
    Returns
    -------
    U_list    : left  SV matrices per block
    sv_list   : singular-value vectors  HSw  per block
    Vt_list   : right SV matrices per block
    positions : block top-left (r, c) coordinates
    LL_shape  : shape of the LL3 sub-band
    pyramid   : dtcwt Pyramid object  (needed to run IDTCWT later)
    transform : dtcwt Transform2d     (needed to run inverse later)
    """
    img = np.array(
        Image.open(img_path).convert("L").resize((M, M)),
        dtype=np.float64,
    )
    tr  = dtcwt.Transform2d()
    pyr = tr.forward(img, nlevels=levels)          # Step 2 – DTCWT
    LL  = pyr.lowpass                              # LL3

    blocks, positions = _partition(LL, block_size) # Step 3 – partition

    U_list, sv_list, Vt_list = [], [], []
    for blk in blocks:
        C = dctn(blk, norm="ortho")                # Step 3 – DCT
        U, s, Vt = _svd(C)                         # Step 4 – SVD
        U_list.append(U)
        sv_list.append(s.copy())
        Vt_list.append(Vt)

    return U_list, sv_list, Vt_list, positions, LL.shape, pyr, tr


# ══════════════════════════════════════════════════════════════════════════════
#  PSO FITNESS
# ══════════════════════════════════════════════════════════════════════════════

def _fitness(alpha_mat: np.ndarray,
             HSw_list, wm_sv_list,
             U_list, Vt_list, orig_dct_blocks) -> np.ndarray:
    """
    Swarm fitness: minimise  λ·(-PSNR)  +  (1-λ)·SV_change
    alpha_mat shape: (n_particles, 1)
    """
    lam   = 0.5
    costs = np.empty(len(alpha_mat))

    for i, (alpha,) in enumerate(alpha_mat):
        mse_acc = sv_acc = 0.0
        for hsw, sw, U, Vt, orig in zip(
                HSw_list, wm_sv_list, U_list, Vt_list, orig_dct_blocks):
            hsw_new  = hsw + alpha * sw
            blk_new  = _isvd(U, hsw_new, Vt)
            mse_acc += np.mean((orig - blk_new) ** 2)
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
    alpha_bounds   : tuple = (0.01, 0.10),
    output_path    : str   = "watermarked.png",
) -> tuple:
    """
    Embed watermark W into host image I following Algorithm 1.

    Returns
    -------
    (Iw_uint8, key)
        Iw_uint8 : watermarked image as uint8 ndarray
        key      : EmbedKey – pass to extract_watermark()
    """

    # ── Step 1: Resize ──────────────────────────────────────────────────────
    print("[Alg1 / S1]  Loading and resizing host image …")

    # ── Steps 2-4: DTCWT → LL3 → DCT blocks → SVD ──────────────────────────
    print("[Alg1 / S2-4]  DTCWT → partition → DCT → SVD on host image …")
    U_list, HSw_list, Vt_list, positions, LL_shape, pyramid, transform = \
        _dtcwt_dct_svd(host_path, M, block_size, dtcwt_levels)
    n_blocks = len(HSw_list)
    print(f"           {n_blocks} blocks, {block_size}×{block_size} each")

    # Re-extract raw DCT blocks (needed for PSO fitness)
    LL = pyramid.lowpass
    raw_blocks, _ = _partition(LL, block_size)
    dct_blocks    = [dctn(b, norm="ortho") for b in raw_blocks]

    # ── Step 5: Henon-encrypt the watermark ─────────────────────────────────
    print("[Alg1 / S5]  Henon-encrypting the watermark …")
    wm_size = int(np.sqrt(n_blocks * block_size))
    W_raw   = np.array(
        Image.open(watermark_path).convert("L").resize((wm_size, wm_size)),
        dtype=np.float64,
    )
    W_enc = henon_encrypt(W_raw, a=henon_a, b=henon_b)

    # ── Step 6: SVD on encrypted watermark ──────────────────────────────────
    print("[Alg1 / S6]  SVD on encrypted watermark …")
    Uw, Sw_full, Vtw = _svd(W_enc)           # Uw and Vtw stored for extraction

    # Tile Sw_full so each block gets a slice of watermark singular values
    total_sv    = n_blocks * block_size
    Sw_tiled    = np.tile(Sw_full, int(np.ceil(total_sv / len(Sw_full))))
    wm_sv_list  = []
    for i, hsw in enumerate(HSw_list):
        k  = len(hsw)
        wm_sv_list.append(Sw_tiled[i * k: i * k + k])

    # ── Steps 7-8: PSO optimises α ──────────────────────────────────────────
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

    # ── Step 9: Embed → ISVD → IDCT → IDTCWT ───────────────────────────────
    print("[Alg1 / S9]  Embedding and reconstructing watermarked image …")
    new_dct_blocks = []
    for hsw, sw, U, Vt in zip(HSw_list, wm_sv_list, U_list, Vt_list):
        hsw_new = hsw + alpha_star * sw          # Eq. (6)  HSw' = HSw + α·Sw
        new_dct_blocks.append(_isvd(U, hsw_new, Vt))

    idct_blocks  = [idctn(C, norm="ortho") for C in new_dct_blocks]
    LL_new       = _merge(idct_blocks, positions, LL_shape, block_size)

    pyramid.lowpass = LL_new
    Iw              = transform.inverse(pyramid)
    Iw_uint8        = np.clip(Iw, 0, 255).astype(np.uint8)
    Image.fromarray(Iw_uint8).save(output_path)
    print(f"           Watermarked image saved → {output_path}")

    # ── Build key bundle ─────────────────────────────────────────────────────
    key = EmbedKey(
        alpha_star      = alpha_star,
        HSw_list        = HSw_list,       # original host SVs  (one list per block)
        Uw              = Uw,             # left  SV matrix of W_enc
        Vtw             = Vtw,            # right SV matrix of W_enc
        watermark_shape = W_raw.shape,
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
    Extract the watermark from a (possibly attacked) watermarked image.
    Implements Algorithm 2 exactly.

    Parameters
    ----------
    watermarked_path : path to the watermarked (or attacked) image  Iw
    key              : EmbedKey returned by embed_watermark()
    output_path      : where to save the extracted watermark

    Returns
    -------
    W_ext : extracted watermark as uint8 ndarray
    """

    # ── Line 1: DTCWT on Iw  (repeat Alg-1 steps 2–4 on the watermarked img) ─
    print("[Alg2 / L1]  DTCWT–DCT–SVD on watermarked image Iw …")
    _, HSw_hat_list, _, _, _, _, _ = _dtcwt_dct_svd(
        watermarked_path, key.M, key.block_size, key.dtcwt_levels
    )
    # HSw_hat_list  →  Σ'h per block  (Algorithm 2 line 6 notation)

    # ── Lines 2-8 are already covered above (U', Σ'h, V' cached in HSw_hat_list)

    # ── Line 9: Obtain host singular values HSw from the stored key ──────────
    #    (non-blind scheme – HSw was saved during embedding)
    HSw_list = key.HSw_list
    print(f"[Alg2 / L9]  Using cached HSw from embedding key ({len(HSw_list)} blocks)")

    # ── Lines 10-12: Recover watermark SVs  Sw' = (HSw_hat − HSw) / α*  ─────
    print(f"[Alg2 / L10-12]  Applying Eq.(7): Sw' = (HSw_hat − HSw) / α*  "
          f"(α* = {key.alpha_star:.6f}) …")
    Sw_prime_list = []
    for hsw_hat, hsw in zip(HSw_hat_list, HSw_list):
        sw_prime = (hsw_hat - hsw) / key.alpha_star    # Eq. (7)
        Sw_prime_list.append(sw_prime)

    # Flatten all recovered SVs into one vector
    Sw_prime_flat = np.concatenate(Sw_prime_list)

    # ── Line 13: Σw_ext = DiagMat(Sw')  ─────────────────────────────────────
    #    Build diagonal matrix from recovered singular values
    H_wm, W_wm = key.watermark_shape
    k           = min(key.Uw.shape[1], key.Vtw.shape[0], len(Sw_prime_flat),
                      H_wm, W_wm)
    Sw_ext      = Sw_prime_flat[:k]                    # line 13

    # ── Line 14: Cw = Uw · Σw_ext · Vw^T  (ISVD using stored Uw, Vtw) ───────
    print("[Alg2 / L14]  ISVD: Cw = Uw · diag(Sw_ext) · Vtw …")
    Cw = _isvd(
        key.Uw[:, :k],       # Uw  – left  SV vectors of original W_enc
        Sw_ext,              # recovered singular values
        key.Vtw[:k, :],      # Vtw – right SV vectors of original W_enc
    )

    # Fit / pad to watermark_shape
    Cw_fit = np.zeros((H_wm, W_wm), dtype=np.float64)
    rh = min(H_wm, Cw.shape[0])
    rw = min(W_wm, Cw.shape[1])
    Cw_fit[:rh, :rw] = Cw[:rh, :rw]

    # ── Line 15: W_ext = HenonDecrypt(Cw)  ───────────────────────────────────
    print("[Alg2 / L15]  Henon chaotic decryption → W_ext …")
    W_ext = henon_decrypt(Cw_fit, a=key.henon_a, b=key.henon_b)

    # Normalise to [0, 255]
    W_norm = W_ext - W_ext.min()
    if W_norm.max() > 0:
        W_norm /= W_norm.max()
    W_ext_uint8 = (W_norm * 255).astype(np.uint8)

    # ── Line 16: return W_ext  ────────────────────────────────────────────────
    Image.fromarray(W_ext_uint8).save(output_path)
    print(f"[Alg2 / L16]  Extracted watermark saved → {output_path}")
    return W_ext_uint8


# ══════════════════════════════════════════════════════════════════════════════
#  QUALITY METRICS
# ══════════════════════════════════════════════════════════════════════════════

def psnr(original: np.ndarray, modified: np.ndarray) -> float:
    """Peak Signal-to-Noise Ratio (dB)."""
    mse = np.mean((original.astype(np.float64) - modified.astype(np.float64)) ** 2)
    return float("inf") if mse == 0 else 10.0 * np.log10(255.0 ** 2 / mse)


def nc(original_wm: np.ndarray, extracted_wm: np.ndarray) -> float:
    """Normalised Correlation between original and extracted watermark."""
    a = original_wm.flatten().astype(np.float64)
    b = extracted_wm.flatten().astype(np.float64)
    denom = np.sqrt(np.sum(a ** 2) * np.sum(b ** 2))
    return float(np.dot(a, b) / denom) if denom > 0 else 0.0


# ══════════════════════════════════════════════════════════════════════════════
#  KEY  I/O  (save / load the EmbedKey to disk using numpy)
# ══════════════════════════════════════════════════════════════════════════════

def save_key(key: EmbedKey, path: str) -> None:
    """Serialise EmbedKey to a .npz file."""
    np.savez_compressed(
        path,
        alpha_star      = np.array([key.alpha_star]),
        HSw_list        = np.array(key.HSw_list, dtype=object),
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

    # ── embed ──
    emb = sub.add_parser("embed", help="Algorithm 1 – embed watermark")
    emb.add_argument("host",       help="Host medical image path")
    emb.add_argument("watermark",  help="Watermark logo image path")
    emb.add_argument("--output",   default="watermarked.png")
    emb.add_argument("--key",      default="embed_key",
                     help="Base path for saved key (.npz appended automatically)")
    emb.add_argument("--M",        type=int,   default=512)
    emb.add_argument("--block",    type=int,   default=8)
    emb.add_argument("--levels",   type=int,   default=3)
    emb.add_argument("--particles",type=int,   default=20)
    emb.add_argument("--iters",    type=int,   default=50)
    emb.add_argument("--alpha-min",type=float, default=0.01)
    emb.add_argument("--alpha-max",type=float, default=0.10)

    # ── extract ──
    ext = sub.add_parser("extract", help="Algorithm 2 – extract watermark")
    ext.add_argument("watermarked", help="Watermarked (possibly attacked) image")
    ext.add_argument("key",         help="Path to key .npz file produced by embed")
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
        print(f"\nPSNR (host vs watermarked): "
              f"{psnr(np.array(Image.open(args.host).convert('L').resize((args.M, args.M))), Iw):.2f} dB")

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