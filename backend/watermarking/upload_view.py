from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
import threading
from django.shortcuts import get_object_or_404
from .upload_runner import run_pipeline
from .models import ImageProcess
import os
from django.http import FileResponse
from .utility import save_image
from .path_helpers import (
    path_original,
    path_watermark,
    path_key,
    path_output,
    path_resized,
    path_wm_encrypted,
    path_wm_raw
)

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def upload_images(request):
    try:
        original = request.FILES.get("original_image")
        watermark = request.FILES.get("watermark_image")

        if not original or not watermark:
            return Response(
                {"error": "Both images are required"},
                status=status.HTTP_400_BAD_REQUEST
            )

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

        save_image(original,path_original(process))
        save_image(watermark,path_watermark(process))

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

    process.set_status(ImageProcess.Status.PENDING, 0)

    thread = threading.Thread(
        target=run_pipeline,
        args=(process.id,),
        daemon=True   
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




