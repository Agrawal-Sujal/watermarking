# urls.py
from django.urls import path
from .views import *

urlpatterns = [
    path("upload/", upload_images, name="upload_images"),
    
    path("process/<int:process_id>/status",get_process_status),
    
    path("process/<int:process_id>/resizing/", get_resizing_step),
    path("process/<int:process_id>/forward/", get_forwarding_step),
    path("process/<int:process_id>/encryption/", get_encryption_step),
    path("process/<int:process_id>/svd/", get_svd_step),
    path("process/<int:process_id>/pso/", get_pso_step),
    path("process/<int:process_id>/embedding/", get_embedding_step),
    path("process/<int:process_id>/threshold/", get_threshold_step),

    # images
    path("process/<int:process_id>/image/original/", get_original_image),
    path("process/<int:process_id>/image/resized/", get_resized_image),
    path("process/<int:process_id>/image/wm_raw/", get_watermark_raw),
    path("process/<int:process_id>/image/wm_encrypted/", get_watermark_encrypted),
    path("process/<int:process_id>/image/output/", get_output_image),

    # key
    path("process/<int:process_id>/key/", download_key),
]