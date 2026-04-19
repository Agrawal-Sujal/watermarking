"""
verify_tamper.py
────────────────
Standalone tamper-detection module.

Public entry point
──────────────────
    verify_tamper(received_path, key, tamper_map_path, overlay_path)

It mirrors the style of embed_watermark() in embedding.py:
  • uses the same _forward_pipeline / resize helpers
  • saves images with cv2 (same as save_image)
  • updates a TamperVerification DB row at each stage
  • raises on hard errors so verify_runner.py can call mark_failed()
"""

import os
import cv2
import numpy as np
from PIL import Image, ImageDraw
from .embedding import _forward_pipeline
from .models import TamperVerification
from .utility import reconstruct_full_image,getImg
from .embed_key import EmbedKey
from .path_helpers import path_verify_tamper_map, path_verify_overlay

# ═════════════════════════════════════════════════════════════════════════════
#  INTERNAL HELPERS
# ═════════════════════════════════════════════════════════════════════════════

def _save_png(path: str, img_bgr: np.ndarray) -> None:
    """Write a numpy array as PNG, creating parent dirs as needed."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    ok = cv2.imwrite(path, img_bgr)
    if not ok:
        raise IOError(f"cv2.imwrite failed for path: {path}")


def _build_tamper_map(
    tamper_grid: np.ndarray,  
    cell_px: int,
    out_w: int,
    out_h: int,
) -> Image.Image:
    """
    Produce a green/red block image at the original image dimensions.
    Block coordinates map directly from the padded M×M grid space;
    since padding is at the bottom and right, (col*cell_px, row*cell_px)
    are the same pixel positions in the original image.

    Blocks that fall outside the original image bounds are clipped/skipped.

    Green  (34, 197, 94)  → authentic block
    Red   (239,  68, 68)  → tampered  block
    """
    n_rows, n_cols = tamper_grid.shape

    img = Image.new("RGB", (out_w, out_h), (34, 197, 94))
    draw = ImageDraw.Draw(img)
    for row in range(n_rows):
        for col in range(n_cols):
            if tamper_grid[row, col]:
                x0 = col * cell_px
                y0 = row * cell_px
                # Skip blocks that start outside the image
                if x0 >= out_w or y0 >= out_h:
                    continue
                x1 = min((col + 1) * cell_px - 1, out_w - 1)
                y1 = min((row + 1) * cell_px - 1, out_h - 1)
                draw.rectangle([x0, y0, x1, y1], fill=(239, 68, 68))

    return img


def _build_overlay(
    received_bgr: np.ndarray,  # original-size BGR (orig_H × orig_W)
    tamper_grid: np.ndarray,   # (n_rows, n_cols) bool
    cell_px: int,
) -> np.ndarray:
    """
    Paint semi-transparent red rectangles over tampered blocks
    directly on the received image at its original dimensions.

    Block coordinates in the padded M×M grid map 1:1 to the original
    image coordinates because the padding is at the bottom and right
    edges. No image resizing is performed, so the overlay aligns
    perfectly with the received image.

    Returns a BGR uint8 array at the received image's original size.
    """
    h, w = received_bgr.shape[:2]
    n_rows, n_cols = tamper_grid.shape

    # Work in RGBA PIL for alpha-composite
    base = Image.fromarray(
        cv2.cvtColor(received_bgr, cv2.COLOR_BGR2RGBA)
    )
    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    for row in range(n_rows):
        for col in range(n_cols):
            if tamper_grid[row, col]:
                x0 = col * cell_px
                y0 = row * cell_px
                # Skip blocks that start outside the image
                if x0 >= w or y0 >= h:
                    continue
                x1 = min((col + 1) * cell_px - 1, w - 1)
                y1 = min((row + 1) * cell_px - 1, h - 1)
                # filled semi-transparent red
                draw.rectangle([x0, y0, x1, y1], fill=(239, 68, 68, 140))
                # solid red border
                draw.rectangle(
                    [x0, y0, x1, y1], outline=(220, 38, 38, 255), width=2
                )

    composited = Image.alpha_composite(base, overlay).convert("RGB")
    return cv2.cvtColor(np.array(composited), cv2.COLOR_RGB2BGR)


def _print_summary(
    n_used: int,
    sv_deltas: np.ndarray,
    T: float,
    n_tampered: int,
    tampered_frac: float,
    is_tampered: bool,
) -> None:
    print(f"Blocks analysed : {n_used}")
    print(
        f"Max SV delta : {sv_deltas.max():.4f}  "
        f"(threshold = {T:.4f})"
    )
    print(
        f"Tampered blocks : {n_tampered}  "
        f"({tampered_frac * 100:.1f} %)"
    )
    verdict = "⚠ TAMPERED" if is_tampered else "✓ AUTHENTIC"
    print(f"Verdict → {verdict}")


# ═════════════════════════════════════════════════════════════════════════════
#  PUBLIC ENTRY POINT
# ═════════════════════════════════════════════════════════════════════════════

def verify_tamper(
    received_path: str,
    key: EmbedKey,
    reconstructed_watermark : str,
    tamper_map_path: str = "tamper_map.png",
    overlay_path: str = "tamper_overlay.png",
    verification_id: int | None = None,
) -> dict:
    """
    Detect and localise tampering in *received_path* using the stored
    dominant singular values in *key*.

    Algorithm
    ---------
    For every LL3 block i:
        delta_i = |received_dominant_SV_i  –  key.HSw_new_dominant[i]|
        delta_i <=  T  →  authentic
        delta_i  >  T  →  tampered

    The threshold T was calibrated during embedding against the
    observed benign PNG round-trip drift, so authentic images are
    immune to false positives caused by lossless re-compression.

    Parameters
    ----------
    received_path   : path to the image to examine (PNG/JPEG)
    key             : EmbedKey produced at embedding time
    tamper_map_path : where to write the green/red block map
    overlay_path    : where to write the received image with red overlay
    verification_id : optional TamperVerification PK – when supplied the
                      function updates the DB row with progress ticks

    Returns
    -------
    {
        "is_tampered"     : bool,
        "tampered_frac"   : float,          # 0.0 – 1.0
        "tamper_grid"     : np.ndarray,     # (n_rows, n_cols) bool
        "sv_deltas"       : np.ndarray,     # (n_rows, n_cols) float64
        "tamper_map_path" : str,
        "overlay_path"    : str,
    }
    """

    verification: TamperVerification | None = None
    if verification_id is not None:
        try:
            verification = TamperVerification.objects.get(id=verification_id)
        except TamperVerification.DoesNotExist:
            verification = None

    def _tick(progress: int) -> None:
        if verification is not None:
            verification.set_status(TamperVerification.Status.VERIFYING, progress)

    # =====================================================
    # 🔹 STEP 1: load & resize received image
    # =====================================================
    _tick(10)

    img_recv = getImg(received_path)  
    img_recv = reconstruct_full_image(img_recv,key)
    
    # _save_png(reconstructed_watermark, img_recv)
    
    # =====================================================
    # 🔹 STEP 2: forward pipeline
    # =====================================================
    _tick(25)

    (_, HSw_hat_list, _, _, positions,
     LL, highpasses, tr) = _forward_pipeline(
        img_recv, key.block_size, key.dtcwt_levels
    )

    LL_shape = LL.shape
    n_blocks = len(HSw_hat_list)
    T        = key.tamper_threshold
    print(f"           Threshold T = {T:.4f}  |  blocks = {n_blocks}")

    # =====================================================
    # 🔹 STEP 3: per-block SV distance
    # =====================================================
    _tick(45)

    sv_deltas_flat = np.array(
        [abs(HSw_hat_list[i][0] - key.HSw_new_dominant[i])
         for i in range(n_blocks)],
        dtype=np.float64,
    )
    tamper_flat = sv_deltas_flat > T

    n_rows  = LL_shape[0] // key.block_size
    n_cols  = LL_shape[1] // key.block_size
    n_used  = n_rows * n_cols

    tamper_grid    = tamper_flat[:n_used].reshape(n_rows, n_cols)
    sv_deltas_grid = sv_deltas_flat[:n_used].reshape(n_rows, n_cols)

    n_tampered    = int(tamper_flat[:n_used].sum())
    tampered_frac = n_tampered / max(n_used, 1)
    is_tampered   = bool(n_tampered > 0)

    _print_summary(n_used, sv_deltas_flat[:n_used], T,
                   n_tampered, tampered_frac, is_tampered)

    # =====================================================
    # 🔹 STEP 4: build visual outputs
    # =====================================================
    _tick(65)

    # The dtcwt library's lowpass (LL) subband is at scale 2^(levels-1),
    # NOT 2^levels.  Compute scale from actual dimensions to be safe.
    padded_size = key.orig_H + key.pad_h          # = M (square)
    scale   = padded_size // LL_shape[0]           # actual spatial scale
    cell_px = key.block_size * scale

    received_bgr = cv2.imread(received_path, cv2.IMREAD_COLOR)
    if received_bgr is None:
        raise ValueError(f"Could not open received image: {received_path}")

    # Use original image dimensions — block coordinates in the padded M×M
    # grid map 1:1 to the original image since padding is bottom/right
    tmap_pil = _build_tamper_map(tamper_grid, cell_px, key.orig_W, key.orig_H)
    tmap_bgr = cv2.cvtColor(np.array(tmap_pil), cv2.COLOR_RGB2BGR)
    _save_png(tamper_map_path, tmap_bgr)

    overlay_bgr = _build_overlay(received_bgr, tamper_grid, cell_px)
    _save_png(overlay_path, overlay_bgr)

    _tick(90)

    # =====================================================
    # 🔹 STEP 5: persist results to DB row
    # =====================================================
    if verification is not None:
        verification.is_tampered          = is_tampered
        verification.tampered_frac        = tampered_frac
        verification.tamper_grid_flat     = tamper_grid.astype(int).flatten().tolist()
        verification.grid_rows            = int(n_rows)
        verification.grid_cols            = int(n_cols)
        verification.sv_deltas_flat       = sv_deltas_grid.flatten().tolist()
        verification.tamper_threshold_used = float(T)
        verification.set_status(TamperVerification.Status.COMPLETED, 100)
        print("[verify_tamper]  DB row updated → COMPLETED")

    return {
        "is_tampered"     : is_tampered,
        "tampered_frac"   : tampered_frac,
        "tamper_grid"     : tamper_grid,
        "sv_deltas"       : sv_deltas_grid,
        "tamper_map_path" : tamper_map_path,
        "overlay_path"    : overlay_path,
    }