from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
import threading
from django.shortcuts import get_object_or_404
from .utils_runner import run_pipeline
from .models import *
import os
import cv2
import numpy as np
from django.http import FileResponse

def save_uploaded_file(file, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    file.seek(0)
    # convert file → numpy array
    file_bytes = np.frombuffer(file.read(), np.uint8)
    img = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)

    if img is None:
        raise ValueError("Invalid image file")

    success = cv2.imwrite(path, img)
    if not success:
        raise ValueError("Failed to save image")

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def upload_images(request):
    try:
        original = request.FILES.get("original_image")
        watermark = request.FILES.get("watermark_image")

        # 🔴 Validation
        if not original or not watermark:
            return Response(
                {"error": "Both images are required"},
                status=status.HTTP_400_BAD_REQUEST
            )

        # 🔴 File type validation
        allowed_types = ["image/png", "image/jpeg", "image/jpg"]

        if original.content_type not in allowed_types:
            return Response(
                {"error": "Invalid original image format"},
                status=status.HTTP_400_BAD_REQUEST
            )

        if watermark.content_type not in allowed_types:
            return Response(
                {"error": "Invalid watermark image format"},
                status=status.HTTP_400_BAD_REQUEST
            )

        # ✅ Step 1: Create process (IMPORTANT for ID/paths)
        process = ImageProcess.objects.create(
            user=request.user,
            status=ImageProcess.Status.PENDING
        )

        save_uploaded_file(original,path_original(process))
        save_uploaded_file(watermark,path_watermark(process))

        start_process(process)
        
        return Response({
            "message": "Process Started",
            "process_id": process.id,
            "status": process.status,
        }, status=status.HTTP_201_CREATED)

    except Exception as e:
        print(str(e))
        return Response(
            {"error": str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


def start_process(process):
    # process = get_object_or_404(
    #     ImageProcess,
    #     id=process_id,
    #     user=request.user
    # )

    # if process.status not in [ImageProcess.Status.PENDING, ImageProcess.Status.FAILED]:
    #     return Response({
    #         "error": "Process already started"
    #     }, status=status.HTTP_400_BAD_REQUEST)

    process.set_status(ImageProcess.Status.PENDING, 0)

    thread = threading.Thread(
        target=run_pipeline,
        args=(process.id,),
        daemon=True   # 🔥 important
    )
    thread.start()

    return Response({
        "message": "Processing started",
        "process_id": process.id,
        "status": process.status
    })
    
    
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_process_status(request, process_id):
    process = get_object_or_404(
        ImageProcess,
        id=process_id,
        user=request.user
    )

    return Response({
        "id": process.id,
        "status": process.status,
        "progress": process.progress,
        "error": process.error_message,
        "created_at": process.created_at
    })
    
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_resizing_step(request, process_id):
    process = get_object_or_404(ImageProcess, id=process_id, user=request.user)

    return Response({
        "status": process.status,
        "progress": process.progress,
        "dtcwt_levels": process.dtcwt_levels,
    })
    
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_resizing_step(request, process_id):
    process = get_object_or_404(ImageProcess, id=process_id, user=request.user)

    return Response({
        "status": process.status,
        "progress": process.progress,
        "dtcwt_levels": process.dtcwt_levels,
    })
    
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_forwarding_step(request, process_id):
    process = get_object_or_404(ImageProcess, id=process_id, user=request.user)

    return Response({
        "n_blocks": process.n_blocks,
        "sv_length": process.sv_length,
        "LL_shape": [process.LL_shape_h, process.LL_shape_w],
    })
    
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_encryption_step(request, process_id):
    process = get_object_or_404(ImageProcess, id=process_id, user=request.user)

    return Response({
        "henon_a": process.henon_a,
        "henon_b": process.henon_b,
        "watermark_shape": process.watermark_shape,
    })
    
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_pso_step(request, process_id):
    process = get_object_or_404(ImageProcess, id=process_id, user=request.user)

    return Response({
        "alpha_star": process.alpha_star,
        "pso_cost": process.pso_cost,
        "pso_particles": process.pso_particles,
        "pso_iterations": process.pso_iterations,
    })
    

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_svd_step(request, process_id):
    process = get_object_or_404(ImageProcess, id=process_id, user=request.user)

    return Response({
        "info": "SVD applied on watermark",
    })
    

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_pso_step(request, process_id):
    process = get_object_or_404(ImageProcess, id=process_id, user=request.user)

    return Response({
        "alpha_star": process.alpha_star,
        "pso_cost": process.pso_cost,
        "pso_particles": process.pso_particles,
        "pso_iterations": process.pso_iterations,
    })
    
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_embedding_step(request, process_id):
    process = get_object_or_404(ImageProcess, id=process_id, user=request.user)

    return Response({
        "psnr_value": process.psnr_value,
    })
    
    
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_threshold_step(request, process_id):
    process = get_object_or_404(ImageProcess, id=process_id, user=request.user)

    return Response({
        "max_benign_drift": process.max_benign_drift,
        "auto_threshold": process.auto_threshold,
        "final_threshold": process.final_threshold,
    })

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_original_image(request, process_id):
    process = get_object_or_404(ImageProcess, id=process_id, user=request.user)

    path = path_original(process)

    if not os.path.exists(path):
        return Response({"error": "Image not found"}, status=404)

    return FileResponse(open(path, "rb"), content_type="image/png")

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_resized_image(request, process_id):
    process = get_object_or_404(ImageProcess, id=process_id, user=request.user)

    path = path_resized(process)

    if not os.path.exists(path):
        return Response({"error": "Image not found"}, status=404)

    return FileResponse(open(path, "rb"), content_type="image/png")

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_watermark_raw(request, process_id):
    process = get_object_or_404(ImageProcess, id=process_id, user=request.user)

    path = path_wm_raw(process)

    if not os.path.exists(path):
        return Response({"error": "Image not found"}, status=404)

    return FileResponse(open(path, "rb"), content_type="image/png")


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_watermark_raw(request, process_id):
    process = get_object_or_404(ImageProcess, id=process_id, user=request.user)

    path = path_wm_raw(process)

    if not os.path.exists(path):
        return Response({"error": "Image not found"}, status=404)

    return FileResponse(open(path, "rb"), content_type="image/png")

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_watermark_encrypted(request, process_id):
    process = get_object_or_404(ImageProcess, id=process_id, user=request.user)

    path = path_wm_encrypted(process)

    if not os.path.exists(path):
        return Response({"error": "Image not found"}, status=404)

    return FileResponse(open(path, "rb"), content_type="image/png")

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_output_image(request, process_id):
    process = get_object_or_404(ImageProcess, id=process_id, user=request.user)

    path = path_output(process)

    if not os.path.exists(path):
        return Response({"error": "Image not found"}, status=404)

    return FileResponse(open(path, "rb"), content_type="image/png")

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def download_key(request, process_id):
    process = get_object_or_404(ImageProcess, id=process_id, user=request.user)

    path = path_key(process)
    path+=".npz"
    print(path)
    if not os.path.exists(path):
        return Response({"error": "Key not found"}, status=404)

    return FileResponse(open(path, "rb"), content_type = "npz")




from .models import (
    TamperVerification,
    path_verify_received,
    path_verify_tamper_map,
    path_verify_overlay,
)
from .verify_runner import run_verify_pipeline


# ── Helper ───────────────────────────────────────────────────────────────────

def _save_image(file_obj, dest_path: str) -> None:
    """Decode an uploaded image and write it to *dest_path* as PNG."""
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    file_obj.seek(0)
    raw   = np.frombuffer(file_obj.read(), np.uint8)
    img   = cv2.imdecode(raw, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Invalid image file – could not decode.")
    if not cv2.imwrite(dest_path, img):
        raise ValueError(f"Could not write image to {dest_path}.")


# ── Views ────────────────────────────────────────────────────────────────────

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def submit_verify(request):
    """
    Submit a (possibly tampered) image for verification.

    Request body (multipart/form-data)
    -----------------------------------
    received_image   : file   – the image to check  [required]
    process_id       : int    – ID of the embedding process whose key
                                will be used            [required]

    Response 201
    ------------
    {
        "message"        : "Verification started",
        "verification_id": <int>,
        "status"         : "pending"
    }
    """
    received_file = request.FILES.get("received_image")
    process_id    = request.data.get("process_id")

    # ── Validation ───────────────────────────────────────────
    if not received_file:
        return Response(
            {"error": "received_image is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not process_id:
        return Response(
            {"error": "process_id is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    allowed_types = {"image/png", "image/jpeg", "image/jpg"}
    if received_file.content_type not in allowed_types:
        return Response(
            {"error": f"Unsupported image type: {received_file.content_type}"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # ── Fetch the source embedding process ───────────────────
    source_process = get_object_or_404(
        ImageProcess,
        id=process_id,
        user=request.user,
    )

    if source_process.status != ImageProcess.Status.COMPLETED:
        return Response(
            {"error": "The source embedding process is not yet completed."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # ── Create DB row ─────────────────────────────────────────
    verification = TamperVerification.objects.create(
        user           = request.user,
        source_process = source_process,
        status         = TamperVerification.Status.PENDING,
    )

    # ── Save uploaded image to disk ───────────────────────────
    try:
        _save_image(received_file, path_verify_received(verification))
    except ValueError as exc:
        verification.mark_failed(str(exc))
        return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    # ── Kick off background thread ────────────────────────────
    verification.set_status(TamperVerification.Status.PENDING, 0)
    threading.Thread(
        target=run_verify_pipeline,
        args=(verification.id,),
        daemon=True,
    ).start()

    return Response(
        {
            "message"        : "Verification started",
            "verification_id": verification.id,
            "status"         : verification.status,
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_verify_status(request, verification_id: int):
    """
    Poll the progress of a verification job.

    Response 200
    ------------
    {
        "id"           : <int>,
        "status"       : "pending" | "verifying" | "completed" | "failed",
        "progress"     : 0-100,
        "error"        : <str | null>,
        "created_at"   : <ISO datetime>
    }
    """
    v = get_object_or_404(
        TamperVerification, id=verification_id, user=request.user
    )
    return Response(
        {
            "id"        : v.id,
            "status"    : v.status,
            "progress"  : v.progress,
            "error"     : v.error_message,
            "created_at": v.created_at,
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_verify_result(request, verification_id: int):
    """
    Return the full verification result once status == 'completed'.

    Response 200 (completed)
    ------------------------
    {
        "id"                    : <int>,
        "status"                : "completed",
        "is_tampered"           : true | false,
        "tampered_frac"         : 0.0 – 1.0,
        "tamper_threshold_used" : <float>,
        "grid_rows"             : <int>,
        "grid_cols"             : <int>,
        "tamper_grid_flat"      : [0|1, ...],   // row-major, 0=authentic 1=tampered
        "sv_deltas_flat"        : [<float>, ...],
        "source_process_id"     : <int | null>
    }

    Response 202 – job still running
    Response 400 – job failed
    """
    v = get_object_or_404(
        TamperVerification, id=verification_id, user=request.user
    )

    if v.status == TamperVerification.Status.FAILED:
        return Response(
            {"error": v.error_message or "Verification failed."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if v.status != TamperVerification.Status.COMPLETED:
        return Response(
            {"message": "Verification still in progress.", "status": v.status},
            status=status.HTTP_202_ACCEPTED,
        )

    return Response(
        {
            "id"                    : v.id,
            "status"                : v.status,
            "is_tampered"           : v.is_tampered,
            "tampered_frac"         : v.tampered_frac,
            "tamper_threshold_used" : v.tamper_threshold_used,
            "grid_rows"             : v.grid_rows,
            "grid_cols"             : v.grid_cols,
            "tamper_grid_flat"      : v.tamper_grid_flat,
            "sv_deltas_flat"        : v.sv_deltas_flat,
            "source_process_id"     : (
                v.source_process_id if v.source_process else None
            ),
        }
    )


# ── Image-serving helpers ─────────────────────────────────────────────────────

def _serve_image(request, verification_id: int, path_fn):
    """Generic image FileResponse helper."""
    v    = get_object_or_404(
        TamperVerification, id=verification_id, user=request.user
    )
    path = path_fn(v)
    if not os.path.exists(path):
        return Response(
            {"error": "Image not yet available."},
            status=status.HTTP_404_NOT_FOUND,
        )
    return FileResponse(open(path, "rb"), content_type="image/png")


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_verify_received_image(request, verification_id: int):
    """Return the uploaded received image."""
    return _serve_image(request, verification_id, path_verify_received)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_verify_tamper_map(request, verification_id: int):
    """Return the tamper-map (green = authentic, red = tampered)."""
    return _serve_image(request, verification_id, path_verify_tamper_map)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_verify_overlay(request, verification_id: int):
    """Return the received image with red overlay on tampered blocks."""
    return _serve_image(request, verification_id, path_verify_overlay)




"""
extract_views.py
────────────────
REST endpoints for the watermark-extraction pipeline.

Endpoints
---------
POST   /extract/submit/                          → submit_extract
GET    /extract/<id>/status/                     → get_extract_status
GET    /extract/<id>/result/                     → get_extract_result
GET    /extract/<id>/image/input/                → get_extract_input_image
GET    /extract/<id>/image/output/               → get_extract_output_image
"""

import os
import threading

import cv2
import numpy as np
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import (
    ImageProcess,
    WatermarkExtraction,
    path_extract_input,
    path_extract_output,
)
from .extract_runner import run_extract_pipeline


# ── Helper ───────────────────────────────────────────────────────────────────

# def _save_image(file_obj, dest_path: str) -> None:
#     """Decode an uploaded image and write it as PNG to *dest_path*."""
#     os.makedirs(os.path.dirname(dest_path), exist_ok=True)
#     file_obj.seek(0)
#     raw = np.frombuffer(file_obj.read(), np.uint8)
#     img = cv2.imdecode(raw, cv2.IMREAD_COLOR)
#     if img is None:
#         raise ValueError("Invalid image file – could not decode.")
#     if not cv2.imwrite(dest_path, img):
#         raise ValueError(f"Could not write image to {dest_path}.")


# def _serve_image(request, extraction_id: int, path_fn):
#     """Generic FileResponse helper for extraction images."""
#     ex   = get_object_or_404(WatermarkExtraction, id=extraction_id, user=request.user)
#     path = path_fn(ex)
#     if not os.path.exists(path):
#         return Response({"error": "Image not yet available."}, status=status.HTTP_404_NOT_FOUND)
#     return FileResponse(open(path, "rb"), content_type="image/png")


# ── Views ─────────────────────────────────────────────────────────────────────

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def submit_extract(request):
    """
    Submit a watermarked image for watermark extraction.

    Request body (multipart/form-data)
    -----------------------------------
    watermarked_image : file  – the watermarked image   [required]
    process_id        : int   – ID of the embedding process whose key
                                will be used             [required]

    Response 201
    ------------
    {
        "message"       : "Extraction started",
        "extraction_id" : <int>,
        "status"        : "pending"
    }
    """
    watermarked_file = request.FILES.get("watermarked_image")
    process_id       = request.data.get("process_id")

    if not watermarked_file:
        return Response(
            {"error": "watermarked_image is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not process_id:
        return Response(
            {"error": "process_id is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    allowed_types = {"image/png", "image/jpeg", "image/jpg"}
    if watermarked_file.content_type not in allowed_types:
        return Response(
            {"error": f"Unsupported image type: {watermarked_file.content_type}"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    source_process = get_object_or_404(
        ImageProcess, id=process_id, user=request.user
    )
    if source_process.status != ImageProcess.Status.COMPLETED:
        return Response(
            {"error": "The source embedding process is not yet completed."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    extraction = WatermarkExtraction.objects.create(
        user           = request.user,
        source_process = source_process,
        status         = WatermarkExtraction.Status.PENDING,
    )

    try:
        _save_image(watermarked_file, path_extract_input(extraction))
    except ValueError as exc:
        extraction.mark_failed(str(exc))
        return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    extraction.set_status(WatermarkExtraction.Status.PENDING, 0)
    threading.Thread(
        target=run_extract_pipeline,
        args=(extraction.id,),
        daemon=True,
    ).start()

    return Response(
        {
            "message"       : "Extraction started",
            "extraction_id" : extraction.id,
            "status"        : extraction.status,
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_extract_status(request, extraction_id: int):
    """
    Poll the progress of an extraction job.

    Response 200
    ------------
    {
        "id"        : <int>,
        "status"    : "pending" | "extracting" | "completed" | "failed",
        "progress"  : 0-100,
        "error"     : <str | null>,
        "created_at": <ISO datetime>
    }
    """
    ex = get_object_or_404(WatermarkExtraction, id=extraction_id, user=request.user)
    return Response({
        "id"        : ex.id,
        "status"    : ex.status,
        "progress"  : ex.progress,
        "error"     : ex.error_message,
        "created_at": ex.created_at,
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_extract_result(request, extraction_id: int):
    """
    Return the full result once status == 'completed'.

    Response 200 (completed)
    ------------------------
    {
        "id"               : <int>,
        "status"           : "completed",
        "alpha_star"       : <float>,
        "n_blocks"         : <int>,
        "sv_length"        : <int>,
        "watermark_shape"  : [H, W],
        "source_process_id": <int | null>
    }

    Response 202 – still running
    Response 400 – failed
    """
    ex = get_object_or_404(WatermarkExtraction, id=extraction_id, user=request.user)

    if ex.status == WatermarkExtraction.Status.FAILED:
        return Response(
            {"error": ex.error_message or "Extraction failed."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if ex.status != WatermarkExtraction.Status.COMPLETED:
        return Response(
            {"message": "Extraction still in progress.", "status": ex.status},
            status=status.HTTP_202_ACCEPTED,
        )

    return Response({
        "id"                : ex.id,
        "status"            : ex.status,
        "alpha_star"        : ex.alpha_star,
        "n_blocks"          : ex.n_blocks,
        "sv_length"         : ex.sv_length,
        "watermark_shape"   : ex.watermark_shape,
        "source_process_id" : ex.source_process_id if ex.source_process else None,
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_extract_input_image(request, extraction_id: int):
    """Return the uploaded watermarked image."""
    return _serve_image(request, extraction_id, path_extract_input)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_extract_output_image(request, extraction_id: int):
    """Return the extracted watermark image."""
    return _serve_image(request, extraction_id, path_extract_output)