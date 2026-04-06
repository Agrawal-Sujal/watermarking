import numpy as np
from PIL import Image
from dataclasses import dataclass
import numpy as np
from dataclasses import dataclass,field
from typing import List, Tuple
from PIL import Image
from scipy.fft import dctn, idctn
import dtcwt
from dtcwt.numpy import Pyramid
from pyswarms.single.global_best import GlobalBestPSO
import io

# ══════════════════════════════════════════════════════════════════════════════
#  KEY BUNDLE
# ══════════════════════════════════════════════════════════════════════════════

@dataclass
class EmbedKey:
    alpha_star        : float
    HSw_new_dominant  : np.ndarray        # shape (n_blocks,)  float64
    tamper_threshold  : float
    Uw                : np.ndarray
    Vtw               : np.ndarray
    watermark_shape   : Tuple[int, int]
    wm_sv_list        : List[np.ndarray] = field(default_factory=list)
    HSw_list          : List[np.ndarray] = field(default_factory=list)
    henon_a           : float = 1.4
    henon_b           : float = 0.3
    M                 : int   = 512
    block_size        : int   = 8
    dtcwt_levels      : int   = 3


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


def henon_encrypt(watermark: np.ndarray,
                  a: float = 1.4, b: float = 0.3) -> np.ndarray:
    wm = watermark.astype(np.float64)
    if wm.max() > 1.0:
        wm /= 255.0
    perm = np.argsort(_henon_seq(wm.size, a, b))
    return wm.flatten()[perm].reshape(wm.shape)


def henon_decrypt(scrambled: np.ndarray,
                  a: float = 1.4, b: float = 0.3) -> np.ndarray:
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
    return np.linalg.svd(A, full_matrices=False)


def _isvd(U, s, Vt) -> np.ndarray:
    return U @ np.diag(s) @ Vt


# ══════════════════════════════════════════════════════════════════════════════
#  IMAGE LOAD HELPER
# ══════════════════════════════════════════════════════════════════════════════

import cv2
import math
def resize(image_path):

    # Load grayscale image
    img = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)

    if img is None:
        raise ValueError("Image not found or invalid path")

    H, W = img.shape

    # Target size (multiple of 64)
    M = math.ceil(max(H, W) / 64) * 64

    # Compute padding
    pad_h = M - H
    pad_w = M - W

    # Pad (black padding → 0)
    padded = np.pad(
        img,
        ((0, pad_h), (0, pad_w)),
        mode='constant',
        constant_values=0
    )

    return padded.astype(np.float32)

def _load_gray(path: str, size: int) -> np.ndarray:
    """Load image, convert to grayscale, resize, return float64."""
    return np.array(
        Image.open(path).convert("L").resize((size, size), Image.LANCZOS),
        dtype=np.float64,
    )


# ══════════════════════════════════════════════════════════════════════════════
#  SHARED FORWARD PIPELINE  image → DTCWT → LL3 → DCT → SVD
# ══════════════════════════════════════════════════════════════════════════════

def _forward_pipeline(img: np.ndarray, block_size: int, levels: int):
    tr  = dtcwt.Transform2d()
    pyr = tr.forward(img, nlevels=levels)
    LL  = pyr.lowpass.copy()
    highpasses = pyr.highpasses

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
#  INVERSE PIPELINE  IDCT → merge → IDTCWT
# ══════════════════════════════════════════════════════════════════════════════

def _inverse_pipeline(new_dct_blocks, positions, LL_shape,
                      highpasses, tr, block_size: int) -> np.ndarray:
    idct_blocks = [idctn(C, norm="ortho") for C in new_dct_blocks]
    LL_new      = _merge(idct_blocks, positions, LL_shape, block_size)
    return tr.inverse(Pyramid(LL_new, highpasses))

def _fitness(alpha_mat, HSw_list, wm_sv_list, *args):
    lam = 0.6

    HSw = np.array(HSw_list)   # (B, k)
    SW  = np.array(wm_sv_list) # (B, k)

    costs = np.zeros(len(alpha_mat))

    for i, (alpha,) in enumerate(alpha_mat):
        # no reconstruction needed
        diff = alpha * SW

        mse = np.mean(diff * diff)
        psnr_val = 10.0 * np.log10(255.0**2 / (mse + 1e-12))

        sv_term = np.mean(np.abs(diff))

        costs[i] = lam * (-psnr_val) + (1 - lam) * sv_term

    return costs

def psnr(original: np.ndarray, modified: np.ndarray) -> float:
    mse = np.mean((original.astype(np.float64) - modified.astype(np.float64)) ** 2)
    return float("inf") if mse == 0 else 10.0 * np.log10(255.0 ** 2 / mse)

import cv2
from django.core.files.base import ContentFile

def numpy_to_png_file(img: 'np.ndarray'):
    """
    Convert numpy array to Django ContentFile (PNG format)
    
    Args:
        img: numpy array (grayscale or RGB)
        filename: name of output file
    
    Returns:
        (filename, ContentFile)
    """
    success, buffer = cv2.imencode('.png', img)
    
    if not success:
        raise ValueError("Failed to encode image")

    return  ContentFile(buffer.tobytes(),"image")

import os

def save_image(path, img):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    
    success = cv2.imwrite(path, img)
    if not success:
        raise ValueError("Failed to save image")

def load_key(npz_path: str) -> EmbedKey:
    """Reconstruct EmbedKey from the .npz file saved during embedding."""
    data = np.load(npz_path, allow_pickle=True)

    return EmbedKey(
        alpha_star        = float(data["alpha_star"]),
        HSw_new_dominant  = data["HSw_new_dominant"],
        tamper_threshold  = float(data["tamper_threshold"]),
        Uw                = data["Uw"],
        Vtw               = data["Vtw"],
        watermark_shape   = tuple(data["watermark_shape"].tolist()),
        henon_a           = float(data["henon_a"]),
        henon_b           = float(data["henon_b"]),
        M                 = int(data["M"]),
        block_size        = int(data["block_size"]),
        dtcwt_levels      = int(data["dtcwt_levels"]),
        HSw_list          = tuple(data["HSw_list"].tolist())
    )


# def extract_watermark(watermarked_path: str, key: EmbedKey,
#                       output_path: str = "extracted_watermark.png") -> np.ndarray:

#     print("[Alg2] Forward pipeline …")
#     Iw = resize(watermarked_path)

#     _, HSw_hat_list, *_ = _forward_pipeline(
#         Iw, key.block_size, key.dtcwt_levels
#     )

#     print(f"[Alg2] Recovering SVs (α* = {key.alpha_star:.6f}) …")

#     # vectorized
#     HSw_hat = np.array(HSw_hat_list)
#     HSw     = np.array(key.HSw_list)

#     Sw_prime = (HSw_hat - HSw) / key.alpha_star   # (B, k)

#     print("[Alg2] Fast ISVD reconstruction …")

#     # average singular values
#     sv_mean = np.mean(Sw_prime, axis=0)

#     k = min(key.Uw.shape[1], key.Vtw.shape[0])
#     sv_k = np.zeros(k)
#     sv_k[:min(k, len(sv_mean))] = sv_mean[:k]

#     # single reconstruction
#     Cw = _isvd(key.Uw[:, :k], sv_k, key.Vtw[:k, :])

#     print("[Alg2] Henon decryption …")

#     W_ext = henon_decrypt(Cw, a=key.henon_a, b=key.henon_b)

#     W_norm = W_ext - W_ext.min()
#     if W_norm.max() > 0:
#         W_norm /= W_norm.max()

#     W_out = (W_norm * 255).astype(np.uint8)

#     Image.fromarray(W_out).save(output_path)
#     print(f"[Alg2] Saved → {output_path}")

#     return W_out

def extract_watermark(
    watermarked_path: str,
    key: EmbedKey,
    output_path: str = "extracted_watermark1.png"
) -> np.ndarray:

    print("[Alg2] Forward pipeline …")

    # ✅ FIX 1: resize returns (img, shape)
    Iw = resize(watermarked_path)

    # Forward pipeline
    _, HSw_hat_list, _, _, _, _, _, _ = _forward_pipeline(
        Iw, key.block_size, key.dtcwt_levels
    )

    print(f"[Alg2] Recovering SVs (α* = {key.alpha_star:.6f}) …")

    # ✅ Convert to proper arrays
    HSw_hat = np.array(HSw_hat_list)           # (B, k)
    HSw     = np.array(key.HSw_list)           # (B, k)

    # ✅ Recover watermark singular values
    Sw_prime = (HSw_hat - HSw) / key.alpha_star   # (B, k)

    print("[Alg2] Averaging SVs across blocks …")

    # ✅ Average across all blocks (preserve structure)
    sv_mean = np.mean(Sw_prime, axis=0)  # (k,)

    print("[Alg2] Reconstructing watermark (ISVD) …")

    # ✅ Ensure correct dimensions
    k = min(len(sv_mean), key.Uw.shape[1], key.Vtw.shape[0])

    sv_k = np.zeros(k)
    sv_k[:k] = sv_mean[:k]

    # ✅ Reconstruct encrypted watermark
    Cw = _isvd(key.Uw[:, :k], sv_k, key.Vtw[:k, :])

    print("[Alg2] Reshaping to original watermark shape …")

    # ✅ VERY IMPORTANT: reshape correctly
    wm_h, wm_w = key.watermark_shape
    Cw_resized = Cw[:wm_h, :wm_w]

    print("[Alg2] Henon decryption …")

    # ✅ Decrypt
    W_ext = henon_decrypt(Cw_resized, a=key.henon_a, b=key.henon_b)

    print("[Alg2] Normalizing output …")

    # ✅ Normalize properly
    W_norm = W_ext - W_ext.min()
    if W_norm.max() > 0:
        W_norm = W_norm / W_norm.max()

    W_out = (W_norm * 255).astype(np.uint8)

    # ✅ Save result
    Image.fromarray(W_out).save(output_path)
    print(f"[Alg2] Saved → {output_path}")

    return W_out

if __name__ == "__main__":
    import argparse, sys

    parser = argparse.ArgumentParser(
        description="Medical Image Watermarking with Tamper Detection"
    )
    sub = parser.add_subparsers(dest="cmd")

    # extract
    ext = sub.add_parser("extract")
    ext.add_argument("watermarked")
    ext.add_argument("key")
    ext.add_argument("--output", default="extracted_watermark1.png")

   

    args = parser.parse_args()


    if args.cmd == "extract":
        key  = load_key(args.key)
        W_ex = extract_watermark(args.watermarked, key, args.output)

    else:
        parser.print_help()
        sys.exit(1)