"""
extract_runner.py
─────────────────
Background thread entry point for watermark extraction.

Usage (called from the view):
    from .extract_runner import run_extract_pipeline
    threading.Thread(
        target=run_extract_pipeline,
        args=(extraction.id,),
        daemon=True,
    ).start()
"""

import traceback
import numpy as np

from .embedding import EmbedKey
from .extract_watermark import extract_watermark
from .verify_runner import load_key
from .models import (
    WatermarkExtraction,
    path_extract_input,
    path_extract_output,
    path_key,
)

def run_extract_pipeline(extraction_id: int) -> None:
    """
    1. Load the WatermarkExtraction row.
    2. Locate the .npz key from the linked ImageProcess.
    3. Call extract_watermark() — handles all progress ticks & DB writes.
    4. Catch any exception and mark the row as FAILED.
    """
    extraction = WatermarkExtraction.objects.get(id=extraction_id)

    try:
        extraction.set_status(WatermarkExtraction.Status.EXTRACTING, 5)

        if extraction.source_process is None:
            raise ValueError(
                "No source_process linked – cannot locate the .npz key."
            )

        key_path = path_key(extraction.source_process) + ".npz"
        key      = load_key(key_path)

        extract_watermark(
            watermarked_path = path_extract_input(extraction),
            key              = key,
            output_path      = path_extract_output(extraction),
            extraction_id    = extraction_id,
        )

    except Exception as exc:
        traceback.print_exc()
        extraction.mark_failed(str(exc))