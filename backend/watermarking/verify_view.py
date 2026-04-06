from .models import TamperVerification
from .verify_runner import run_verify_pipeline
from .utility import save_image
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
import threading
from django.shortcuts import get_object_or_404
from .models import ImageProcess
import os
from django.http import FileResponse
from .path_helpers import (
    path_verify_received,
    path_verify_tamper_map,
    path_verify_overlay,
)


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
        save_image(received_file, path_verify_received(verification))
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
