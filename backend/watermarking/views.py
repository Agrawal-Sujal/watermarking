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