import numpy as np
import os
import cv2
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from .models import WatermarkExtraction
from rest_framework.response import Response
from rest_framework import status
from .embed_key import EmbedKey
from typing import Optional

# def reconstruct_full_image(cropped, key):
#     # return cropped
#     orig_H = key.orig_H
#     orig_W = key.orig_W
#     pad_h  = key.pad_h
#     pad_w  = key.pad_w

#     H = orig_H + pad_h
#     W = orig_W + pad_w

#     full = np.zeros((H, W), dtype=cropped.dtype)

#     # place original
#     full[:orig_H, :orig_W] = cropped

#     # restore pads
#     if pad_h > 0:
#         full[orig_H:H, :] = key.bottom_pad

#     if pad_w > 0:
#         full[:, orig_W:W] = key.right_pad

#     return full

# def reconstruct_full_image(cropped, key):
#     orig_H = key.orig_H
#     orig_W = key.orig_W
#     pad_h  = key.pad_h
#     pad_w  = key.pad_w

#     H = orig_H + pad_h
#     W = orig_W + pad_w

#     full = np.zeros((H, W), dtype=cropped.dtype)

#     # 1️⃣ Place original cropped image
#     full[:orig_H, :orig_W] = cropped

#     # 2️⃣ Bottom pad (excluding corner)
#     if pad_h > 0 and key.bottom_pad is not None:
#         full[orig_H:H, :orig_W] = key.bottom_pad[:, :orig_W]

#     # 3️⃣ Right pad (excluding corner)
#     if pad_w > 0 and key.right_pad is not None:
#         full[:orig_H, orig_W:W] = key.right_pad[:orig_H, :]

#     # 4️⃣ Corner pad (only if both exist)
#     if pad_h > 0 and pad_w > 0 and key.corner_pad is not None:
#         full[orig_H:H, orig_W:W] = key.corner_pad

#     return full

def reconstruct_full_image(cropped, key):
    orig_H = key.orig_H
    orig_W = key.orig_W
    pad_h  = key.pad_h
    pad_w  = key.pad_w

    H = orig_H + pad_h
    W = orig_W + pad_w

    # FIX BUG 5: always zero-pad — never re-attach the old watermarked
    # padding strips from the key. Those strips carry a different watermark
    # signal than the cropped region and corrupt the boundary blocks in the
    # forward pipeline, introducing edge artifacts in the extracted watermark.
    full = np.zeros((H, W), dtype=np.float32)
    full[:orig_H, :orig_W] = cropped

    return full


def getImg(image_path):

    # Load grayscale image
    img = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)

    if img is None:
        raise ValueError("Image not found or invalid path")

    return img


def save_image(file_obj, dest_path: str) -> None:
    """Decode an uploaded image and write it as PNG to *dest_path*."""
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    file_obj.seek(0)
    raw = np.frombuffer(file_obj.read(), np.uint8)
    img = cv2.imdecode(raw, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Invalid image file – could not decode.")
    if not cv2.imwrite(dest_path, img):
        raise ValueError(f"Could not write image to {dest_path}.")


def serve_image(request, extraction_id: int, path_fn):
    """Generic FileResponse helper for extraction images."""
    ex   = get_object_or_404(WatermarkExtraction, id=extraction_id, user=request.user)
    path = path_fn(ex)
    if not os.path.exists(path):
        return Response({"error": "Image not yet available."}, status=status.HTTP_404_NOT_FOUND)
    return FileResponse(open(path, "rb"), content_type="image/png")


def load_key(npz_path: str) -> EmbedKey:
    """
    Load an EmbedKey from a .npz file written by embed_watermark().
    Handles both new keys (with Sw_full) and legacy keys (without).
    """
    data = np.load(npz_path, allow_pickle=False)

    def _opt_arr(name: str) -> Optional[np.ndarray]:
        """Return array or None if key missing or array is empty."""
        if name not in data:
            return None
        arr = data[name]
        return arr if arr.size > 0 else None

    # FIX BUG 4: load Sw_full; fall back gracefully for legacy keys that
    # pre-date this fix (Sw_full will be reconstructed as zeros — extraction
    # will still be poor, but won't crash).
    if "Sw_full" in data:
        Sw_full = data["Sw_full"].astype(np.float64)
    else:
        # Legacy key: best-effort — use zeros of inferred size
        Uw_tmp = data["Uw"]
        Sw_full = np.zeros(min(Uw_tmp.shape), dtype=np.float64)

    # FIX BUG 2: force float64 regardless of how the array was saved
    HSw_list = data["HSw_list"].astype(np.float64)

    return EmbedKey(
        alpha_star       = float(data["alpha_star"]),
            block_size       = int(data["block_size"]),
            dtcwt_levels     = int(data["dtcwt_levels"]),
            henon_a          = float(data["henon_a"]),
            henon_b          = float(data["henon_b"]),
            M                = int(data["M"]),
            Uw               = data["Uw"].astype(np.float64),
            Sw_full          = Sw_full,
            Vtw              = data["Vtw"].astype(np.float64),
            watermark_shape  = tuple(data["watermark_shape"].tolist()),
            HSw_list         = HSw_list,
            HSw_new_dominant = data["HSw_new_dominant"].astype(np.float64),
            tamper_threshold = float(data["tamper_threshold"]),
            orig_H           = int(data["orig_H"]),
            orig_W           = int(data["orig_W"]),
            pad_h            = int(data["pad_h"]),
            pad_w            = int(data["pad_w"]),
            bottom_pad       = _opt_arr("bottom_pad"),
            right_pad        = _opt_arr("right_pad"),
            corner_pad       = _opt_arr("corner_pad"),
            watermark_shape_raw = tuple(data["watermark_shape_raw"].tolist()) if "watermark_shape_raw" in data else tuple(data["watermark_shape"].tolist()),
    )