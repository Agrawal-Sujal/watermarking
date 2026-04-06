import numpy as np
from dataclasses import dataclass,field
from typing import List, Tuple

# ══════════════════════════════════════════════════════════════════════════════
#  KEY BUNDLE
# ══════════════════════════════════════════════════════════════════════════════

@dataclass
class EmbedKey:
    alpha_star        : float
    HSw_new_dominant  : np.ndarray       
    tamper_threshold  : float
    Uw                : np.ndarray
    Vtw               : np.ndarray
    watermark_shape   : Tuple[int, int]
    wm_sv_list        : List[np.ndarray] = field(default_factory=list)
    HSw_list          : List[np.ndarray] = field(default_factory=list)
    henon_a           : float = 1.4
    henon_b           : float = 0.3
    M                 : int   = 512
    block_size        : int   = 8
    dtcwt_levels      : int   = 3
    
    orig_H            : int = 0
    orig_W            : int = 0
    pad_h             : int = 0
    pad_w             : int = 0

    bottom_pad        : np.ndarray = None
    right_pad         : np.ndarray = None