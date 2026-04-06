from django.db import models
from django.contrib.auth.models import User

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

# ── Model ────────────────────────────────────────────────────

class TamperVerification(models.Model):
    """
    One verify_tamper() run.

    Lifecycle
    ---------
    PENDING  →  VERIFYING  →  COMPLETED
                           →  FAILED
    """

    class Status(models.TextChoices):
        PENDING   = "pending",    "Pending"
        VERIFYING = "verifying",  "Running Tamper Verification"
        COMPLETED = "completed",  "Completed"
        FAILED    = "failed",     "Failed"

    # ── Relations ────────────────────────────────────────────
    user = models.ForeignKey(
        "auth.User",
        on_delete=models.CASCADE,
        related_name="tamper_verifications",
    )
    # The ImageProcess whose key was used for embedding.
    # Nullable so a user can supply an external key file instead.
    source_process = models.ForeignKey(
        "ImageProcess",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="verifications",
        help_text="The embedding process whose .npz key is used.",
    )

    # ── Status / progress ────────────────────────────────────
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )
    progress      = models.IntegerField(default=0)
    error_message = models.TextField(null=True, blank=True)

    # ── Results written by verify_tamper() ───────────────────
    is_tampered   = models.BooleanField(null=True, blank=True)
    tampered_frac = models.FloatField(null=True, blank=True)
    # Grid stored as a flat JSON list (row-major); reconstruct with
    # np.array(obj.tamper_grid_flat).reshape(obj.grid_rows, obj.grid_cols)
    tamper_grid_flat = models.JSONField(null=True, blank=True)
    grid_rows        = models.IntegerField(null=True, blank=True)
    grid_cols        = models.IntegerField(null=True, blank=True)
    # Per-block SV deltas (same shape as grid, stored flat)
    sv_deltas_flat   = models.JSONField(null=True, blank=True)
    tamper_threshold_used = models.FloatField(null=True, blank=True)

    # ── Timestamps ───────────────────────────────────────────
    created_at = models.DateTimeField(auto_now_add=True)

    # ── Helpers ──────────────────────────────────────────────
    def set_status(self, status: str, progress: int) -> None:
        self.status   = status
        self.progress = progress
        self.save()

    def mark_failed(self, error: str) -> None:
        self.status        = self.Status.FAILED
        self.error_message = str(error)
        self.save()

    def __str__(self) -> str:
        verdict = (
            "TAMPERED" if self.is_tampered
            else "AUTHENTIC" if self.is_tampered is False
            else "UNKNOWN"
        )
        return f"Verify {self.id} [{verdict}] – {self.user.username}"


# ── Model ────────────────────────────────────────────────────

class WatermarkExtraction(models.Model):
    """
    One extract_watermark() run.

    Lifecycle:  PENDING → EXTRACTING → COMPLETED
                                    → FAILED
    """

    class Status(models.TextChoices):
        PENDING    = "pending",    "Pending"
        EXTRACTING = "extracting", "Extracting Watermark"
        COMPLETED  = "completed",  "Completed"
        FAILED     = "failed",     "Failed"

    # ── Relations ────────────────────────────────────────────
    user = models.ForeignKey(
        "auth.User",
        on_delete=models.CASCADE,
        related_name="watermark_extractions",
    )
    source_process = models.ForeignKey(
        "ImageProcess",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="extractions",
        help_text="The embedding process whose .npz key is used.",
    )

    # ── Status / progress ────────────────────────────────────
    status        = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )
    progress      = models.IntegerField(default=0)
    error_message = models.TextField(null=True, blank=True)

    # ── Algorithm metadata written back on completion ─────────
    alpha_star      = models.FloatField(null=True, blank=True)
    n_blocks        = models.IntegerField(null=True, blank=True)
    sv_length       = models.IntegerField(null=True, blank=True)
    watermark_shape = models.JSONField(null=True, blank=True)

    # ── Timestamps ───────────────────────────────────────────
    created_at = models.DateTimeField(auto_now_add=True)

    # ── Helpers ──────────────────────────────────────────────
    def set_status(self, status: str, progress: int) -> None:
        self.status   = status
        self.progress = progress
        self.save()

    def mark_failed(self, error: str) -> None:
        self.status        = self.Status.FAILED
        self.error_message = str(error)
        self.save()

    def __str__(self) -> str:
        return f"Extraction {self.id} – {self.user.username}"