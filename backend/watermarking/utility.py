import numpy as np
import os
import cv2
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from .models import WatermarkExtraction
from rest_framework.response import Response
from rest_framework import status
from .embed_key import EmbedKey

def reconstruct_full_image(cropped, key):
    # return cropped
    orig_H = key.orig_H
    orig_W = key.orig_W
    pad_h  = key.pad_h
    pad_w  = key.pad_w

    H = orig_H + pad_h
    W = orig_W + pad_w

    full = np.zeros((H, W), dtype=cropped.dtype)

    # place original
    full[:orig_H, :orig_W] = cropped

    # restore pads
    if pad_h > 0:
        full[orig_H:H, :] = key.bottom_pad

    if pad_w > 0:
        full[:, orig_W:W] = key.right_pad

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
        HSw_list          = tuple(data["HSw_list"].tolist()),
        orig_H            = int(data["orig_H"]),
        orig_W            = int(data["orig_W"]),
        pad_h             = int(data["pad_h"]),
        pad_w             = int(data["pad_w"]),
        bottom_pad        = data["bottom_pad"],
        right_pad         = data["right_pad"],
    )