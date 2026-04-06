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

import threading

from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from .models import ImageProcess, WatermarkExtraction
from .extract_runner import run_extract_pipeline
from .utility import save_image, serve_image
from .path_helpers import path_extract_input, path_extract_output


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
        save_image(watermarked_file, path_extract_input(extraction))
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
    return serve_image(request, extraction_id, path_extract_input)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_extract_output_image(request, extraction_id: int):
    """Return the extracted watermark image."""
    return serve_image(request, extraction_id, path_extract_output)