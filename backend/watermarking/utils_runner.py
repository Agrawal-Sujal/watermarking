
import traceback
from .models import *
from .embedding import embed_watermark


def run_pipeline(process_id):
    process = ImageProcess.objects.get(id=process_id)

    try:
        embed_watermark(
            host_path=path_original(process),
            watermark_path=path_watermark(process),
            process_id=process.id   
        )
        
    except Exception as e:
        traceback.print_exc()
        process.mark_failed(str(e))