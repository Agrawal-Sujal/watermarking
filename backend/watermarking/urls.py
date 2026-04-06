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
from .views import (
    submit_verify,
    get_verify_status,
    get_verify_result,
    get_verify_received_image,
    get_verify_tamper_map,
    get_verify_overlay,
)

urlpatterns += [
    # ── Submit ───────────────────────────────────────────────
    # POST  /verify/submit/
    #   Body: received_image (file), process_id (int)
    path("verify/submit/", submit_verify, name="submit_verify"),

    # ── Status polling ───────────────────────────────────────
    # GET   /verify/<id>/status/
    path(
        "verify/<int:verification_id>/status/",
        get_verify_status,
        name="get_verify_status",
    ),

    # ── Full result ──────────────────────────────────────────
    # GET   /verify/<id>/result/
    path(
        "verify/<int:verification_id>/result/",
        get_verify_result,
        name="get_verify_result",
    ),

    # ── Images ───────────────────────────────────────────────
    # GET   /verify/<id>/image/received/
    path(
        "verify/<int:verification_id>/image/received/",
        get_verify_received_image,
        name="get_verify_received_image",
    ),
    # GET   /verify/<id>/image/tamper_map/
    path(
        "verify/<int:verification_id>/image/tamper_map/",
        get_verify_tamper_map,
        name="get_verify_tamper_map",
    ),
    # GET   /verify/<id>/image/overlay/
    path(
        "verify/<int:verification_id>/image/overlay/",
        get_verify_overlay,
        name="get_verify_overlay",
    ),
]