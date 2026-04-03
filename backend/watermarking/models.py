from django.db import models
from django.contrib.auth.models import User
import os
import uuid


# def _get_filename(filename):
#     ext = filename.split('.')[-1]
#     return f"{uuid.uuid4().hex}.{ext}"
def get_filename(filename):
    """
    Generate unique filename while preserving extension
    """
    ext = os.path.splitext(filename)[1]  # includes dot (.png)

    if not ext:
        ext = ".png"  # fallback (important for your pipeline)

    return f"{uuid.uuid4().hex}{ext}"

def path_original(instance):
    return f"storage/images/user_{instance.user.id}/process_{instance.id}/original_image.png"


def path_watermark(instance):
    return f"storage/watermark/user_{instance.user.id}/process_{instance.id}/watermark_image.png"


def path_resized(instance):
    return f"storage/resized/user_{instance.user.id}/process_{instance.id}/resized_image.png"


def path_wm_raw(instance):
    return f"storage/watermark_raw/user_{instance.user.id}/process_{instance.id}/watermark_raw.png"


def path_wm_encrypted(instance):
    return f"storage/watermark_encrypted/user_{instance.user.id}/process_{instance.id}/watermark_encrypted.png"


def path_output(instance):
    return f"storage/output/user_{instance.user.id}/process_{instance.id}/watermarked_image.png"


def path_key(instance):
    return f"storage/keys/user_{instance.user.id}/process_{instance.id}/key"



class ImageProcess(models.Model):

    # =========================================================
    # 🔹 STATUS ENUM (CLEAN PIPELINE CONTROL)
    # =========================================================
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"

        RESIZING = "resizing", "Resizing Image"
        FORWARDING = "forwarding", "Running Forward Pipeline"
        ENCRYPTING = "encrypting", "Encrypting Watermark"
        SVD = "svd", "Applying SVD"
        PSO = "pso", "Optimizing with PSO"
        EMBEDDING = "embedding", "Embedding Watermark"
        THRESHOLDING = "thresholding","Thresholding"
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"

    status = models.CharField(
        max_length=50,
        choices=Status.choices,
        default=Status.PENDING
    )

    # =========================================================
    # 🔹 USER
    # =========================================================
    user = models.ForeignKey(User, on_delete=models.CASCADE)

    # =========================================================
    # 🔹 ALGORITHM PARAMETERS
    # =========================================================
    alpha_star = models.FloatField(null=True, blank=True)
    tamper_threshold = models.FloatField(null=True, blank=True)

    # PSO
    pso_particles = models.IntegerField(null=True, blank=True)
    pso_iterations = models.IntegerField(null=True, blank=True)
    pso_cost = models.FloatField(null=True, blank=True)

    # =========================================================
    # 🔹 PIPELINE METADATA
    # =========================================================
    dtcwt_levels = models.IntegerField(null=True, blank=True)

    n_blocks = models.IntegerField(null=True, blank=True)
    sv_length = models.IntegerField(null=True, blank=True)

    LL_shape_h = models.IntegerField(null=True, blank=True)
    LL_shape_w = models.IntegerField(null=True, blank=True)
    
    max_benign_drift = models.FloatField(null = True,blank = True)
    auto_threshold = models.FloatField(null = True,blank = True)
    final_threshold = models.FloatField(null = True,blank = True)
    watermark_shape = models.JSONField(null=True, blank=True)
    
    # =========================================================
    # 🔹 WATERMARK INFO
    # =========================================================

    henon_a = models.FloatField(null=True, blank=True)
    henon_b = models.FloatField(null=True, blank=True)


    # =========================================================
    # 🔹 METRICS
    # =========================================================
    psnr_value = models.FloatField(null=True, blank=True)

    # =========================================================
    # 🔹 TIMESTAMP
    # =========================================================
    created_at = models.DateTimeField(auto_now_add=True)
    error_message = models.TextField(null=True, blank=True)
    progress = models.IntegerField(default=0)
    
    def __str__(self):
        return f"Process {self.id} - {self.user.username}"
    
    def set_status(self,status,progress):
        self.status = status
        self.progress = progress
        self.save()
        
    def mark_failed(self,error):
        self.status = self.Status.FAILED
        self.error_message = error
        self.save()
    
    
