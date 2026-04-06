import cv2
import numpy as np
import os
from skimage.metrics import structural_similarity as ssim
import matplotlib.pyplot as plt


# -----------------------------
# 1. Load Images (with cropping)
# -----------------------------
def load_images(orig_path, wm_path):
    print("Current Working Directory:", os.getcwd())

    orig = cv2.imread(orig_path)
    wm = cv2.imread(wm_path)

    if orig is None:
        raise FileNotFoundError(f"Original image not found: {orig_path}")

    if wm is None:
        raise FileNotFoundError(f"Watermarked image not found: {wm_path}")

    print("Original shape:", orig.shape)
    print("Watermarked shape:", wm.shape)

    # Crop watermarked image (padding on right & bottom)
    if wm.shape[0] >= orig.shape[0] and wm.shape[1] >= orig.shape[1]:
        wm = wm[:orig.shape[0], :orig.shape[1]]
        print("✔ Cropped watermarked image to match original")
    else:
        raise ValueError("Watermarked image is smaller than original — unexpected")

    return orig, wm


# -----------------------------
# 2. Convert to Luminance
# -----------------------------
def to_luminance(img):
    ycbcr = cv2.cvtColor(img, cv2.COLOR_BGR2YCrCb)
    return ycbcr[:, :, 0]


# -----------------------------
# 3. Metrics
# -----------------------------
def compute_mse(img1, img2):
    return np.mean((img1 - img2) ** 2)


def compute_psnr(img1, img2):
    mse = compute_mse(img1, img2)
    if mse == 0:
        return float('inf')
    return 10 * np.log10((255 ** 2) / mse)


def compute_ssim(img1, img2):
    val, _ = ssim(img1, img2, full=True)
    return val


def compute_ncc(img1, img2):
    img1 = img1.astype(np.float64)
    img2 = img2.astype(np.float64)

    num = np.sum(img1 * img2)
    den = np.sqrt(np.sum(img1**2) * np.sum(img2**2))

    return num / den


# -----------------------------
# 4. Difference Map
# -----------------------------
def difference_map(orig, wm):
    diff = cv2.absdiff(orig, wm)
    diff = cv2.normalize(diff, None, 0, 255, cv2.NORM_MINMAX)
    return diff


# -----------------------------
# 5. Edge Maps
# -----------------------------
def edge_maps(orig, wm):
    edge_orig = cv2.Canny(orig, 100, 200)
    edge_wm = cv2.Canny(wm, 100, 200)
    return edge_orig, edge_wm


# -----------------------------
# 6. Histogram
# -----------------------------
def plot_histogram(orig, wm):
    plt.figure()
    plt.title("Histogram Comparison")

    plt.hist(orig.ravel(), bins=256, alpha=0.5, label="Original")
    plt.hist(wm.ravel(), bins=256, alpha=0.5, label="Watermarked")

    plt.legend()
    plt.show()


# -----------------------------
# 7. Main Evaluation
# -----------------------------
def evaluate(orig_path, wm_path):

    orig, wm = load_images(orig_path, wm_path)

    # Convert to luminance
    orig_y = to_luminance(orig)
    wm_y = to_luminance(wm)

    # Metrics
    mse = compute_mse(orig_y, wm_y)
    psnr = compute_psnr(orig_y, wm_y)
    ssim_val = compute_ssim(orig_y, wm_y)
    ncc = compute_ncc(orig_y, wm_y)

    print("\n--- Imperceptibility Metrics ---")
    print(f"MSE  : {mse:.4f}")
    print(f"PSNR : {psnr:.4f} dB")
    print(f"SSIM : {ssim_val:.6f}")
    print(f"NCC  : {ncc:.6f}")

    # Difference map
    diff = difference_map(orig_y, wm_y)

    # Edge maps
    edge_orig, edge_wm = edge_maps(orig_y, wm_y)

    # -----------------------------
    # Visualization
    # -----------------------------
    plt.figure(figsize=(12, 8))

    plt.subplot(2, 3, 1)
    plt.title("Original")
    plt.imshow(orig_y, cmap='gray')
    plt.axis('off')

    plt.subplot(2, 3, 2)
    plt.title("Watermarked")
    plt.imshow(wm_y, cmap='gray')
    plt.axis('off')

    plt.subplot(2, 3, 3)
    plt.title("Difference")
    plt.imshow(diff, cmap='gray')
    plt.axis('off')

    plt.subplot(2, 3, 4)
    plt.title("Edges Original")
    plt.imshow(edge_orig, cmap='gray')
    plt.axis('off')

    plt.subplot(2, 3, 5)
    plt.title("Edges Watermarked")
    plt.imshow(edge_wm, cmap='gray')
    plt.axis('off')

    plt.tight_layout()
    plt.show()

    # Histogram
    plot_histogram(orig_y, wm_y)


# -----------------------------
# 8. Run
# -----------------------------
if __name__ == "__main__":
    evaluate("watermark_raw_2.png", "extracted_watermark_4.png")