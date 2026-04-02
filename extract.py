import json
import numpy as np
import cv2
import dtcwt
import argparse

# =============================
# BLOCKING
# =============================
def blocks_4d(image):
    H, W = image.shape
    return image.reshape(H//8, 8, W//8, 8).swapaxes(1, 2)


# =============================
# DCT
# =============================
def apply_dct_4d(blocks):
    H, W, _, _ = blocks.shape
    dct_blocks = np.zeros_like(blocks)

    for i in range(H):
        for j in range(W):
            block = blocks[i, j].astype(np.float32) - 128
            dct_blocks[i, j] = cv2.dct(block)

    return dct_blocks


# =============================
# SVD
# =============================
def svd_and_cache(dct_blocks):
    H, W, _, _ = dct_blocks.shape

    U_cache = np.zeros_like(dct_blocks)
    Vt_cache = np.zeros_like(dct_blocks)
    HSw = np.zeros((H, W, 8))

    for i in range(H):
        for j in range(W):
            C = dct_blocks[i, j]

            U, S, Vt = np.linalg.svd(C, full_matrices=False)

            U_cache[i, j] = U
            Vt_cache[i, j] = Vt
            HSw[i, j] = S

    return U_cache, Vt_cache, HSw


# =============================
# HENON DECRYPT
# =============================
def henon_decrypt(W_enc, indices):
    flat = W_enc.flatten()
    original = np.zeros_like(flat)

    for i, idx in enumerate(indices):
        original[idx] = flat[i]

    return original.reshape(W_enc.shape)


# =============================
# MAIN EXTRACTION FUNCTION
# =============================
def extract_watermark(watermarked_img_path, key_path, output_path="extracted.png"):

    print("🔹 Loading inputs...")

    # Load watermarked image
    Iw = cv2.imread(watermarked_img_path, cv2.IMREAD_GRAYSCALE)
    if Iw is None:
        raise ValueError("Watermarked image not found")
    Iw = Iw.astype(np.float32)

    # Load key
    with open(key_path, "r") as f:
        key = json.load(f)

    alpha = key["alpha"]
    indices = np.array(key["indices"])
    HSw_original = np.array(key["HSw"])
    Uw = np.array(key["Uw"])
    Vw = np.array(key["Vw"])
    W_shape = tuple(key["watermark_shape"])

    print("🔹 Step 1: DTCWT...")
    transform = dtcwt.Transform2d()
    coeffs_w = transform.forward(Iw, nlevels=3)
    LL3_w = coeffs_w.lowpass

    print("🔹 Step 2: Block division...")
    blocks_w = blocks_4d(LL3_w)

    print("🔹 Step 3: DCT...")
    dct_blocks_w = apply_dct_4d(blocks_w)

    print("🔹 Step 4: SVD...")
    _, _, HSw_hat = svd_and_cache(dct_blocks_w)

    # Step 5
    Sw_extracted = (HSw_hat - HSw_original) / alpha

    # ✅ Use single block (stable)
    Sw_final = Sw_extracted[0, 0]

    # Step 6
    S_mat = np.diag(Sw_final)

    W_enc_reconstructed = Uw @ S_mat @ Vw

    # ✅ DO NOT normalize
    # W_enc_reconstructed = np.clip(W_enc_reconstructed, 0, 1)

    # Step 7
    # W_ext = henon_decrypt(W_enc_reconstructed, indices)
    W_ext = W_enc_reconstructed

    # Final cleanup
    # W_ext = np.clip(W_ext, 0, 1)

    print("🔹 Saving result...")
    # W_img = (W_ext * 255).astype(np.uint8)
    cv2.imwrite(output_path, W_ext)

    print("✅ Extraction complete!")
    print("📌 Saved at:", output_path)

    
def main():

    parser = argparse.ArgumentParser()
    parser.add_argument("--image", required=True)
    parser.add_argument("--key", default="key.json")
    parser.add_argument("--extract")
    args = parser.parse_args()
    
    extract_watermark(args.image, args.key,args.extract)
    
    
main()
