import cv2
import numpy as np
from skimage.metrics import structural_similarity as ssim
import matplotlib.pyplot as plt

# -----------------------------
# 1. Load Images
# -----------------------------
def load_images(orig_path, wm_path):
    orig = cv2.imread(orig_path)
    wm = cv2.imread(wm_path)

    if orig.shape != wm.shape:
        raise ValueError("Images must have same dimensions")

    return orig, wm


# -----------------------------
# 2. Convert to Y channel
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

    numerator = np.sum(img1 * img2)
    denominator = np.sqrt(np.sum(img1**2) * np.sum(img2**2))

    return numerator / denominator


# -----------------------------
# 4. ROI Metrics
# -----------------------------
def compute_roi_metrics(orig, wm, roi_mask):
    orig_roi = orig[roi_mask == 1]
    wm_roi = wm[roi_mask == 1]

    mse = np.mean((orig_roi - wm_roi) ** 2)
    psnr = 10 * np.log10((255 ** 2) / mse) if mse != 0 else float('inf')

    return mse, psnr


# -----------------------------
# 5. Difference Map
# -----------------------------
def difference_map(orig, wm):
    diff = cv2.absdiff(orig, wm)
    diff = cv2.normalize(diff, None, 0, 255, cv2.NORM_MINMAX)
    return diff


# -----------------------------
# 6. Histogram Comparison
# -----------------------------
def plot_histograms(orig, wm):
    plt.figure()
    plt.title("Histogram Comparison")

    plt.hist(orig.ravel(), bins=256, alpha=0.5, label='Original')
    plt.hist(wm.ravel(), bins=256, alpha=0.5, label='Watermarked')

    plt.legend()
    plt.show()


# -----------------------------
# 7. Edge Preservation
# -----------------------------
def edge_maps(orig, wm):
    edge_orig = cv2.Canny(orig, 100, 200)
    edge_wm = cv2.Canny(wm, 100, 200)
    return edge_orig, edge_wm


# -----------------------------
# 8. Main Evaluation Pipeline
# -----------------------------
def evaluate(orig_path, wm_path, roi_mask=None):
    orig, wm = load_images(orig_path, wm_path)

    # Convert to luminance
    orig_y = to_luminance(orig)
    wm_y = to_luminance(wm)

    # Metrics
    mse = compute_mse(orig_y, wm_y)
    psnr = compute_psnr(orig_y, wm_y)
    ssim_val = compute_ssim(orig_y, wm_y)
    ncc = compute_ncc(orig_y, wm_y)

    print("\n--- Global Metrics ---")
    print(f"MSE  : {mse:.4f}")
    print(f"PSNR : {psnr:.4f} dB")
    print(f"SSIM : {ssim_val:.6f}")
    print(f"NCC  : {ncc:.6f}")

    # ROI metrics
    if roi_mask is not None:
        roi_mse, roi_psnr = compute_roi_metrics(orig_y, wm_y, roi_mask)
        print("\n--- ROI Metrics ---")
        print(f"ROI MSE  : {roi_mse:.4f}")
        print(f"ROI PSNR : {roi_psnr:.4f} dB")

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
    plt.title("Difference Map")
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
    plot_histograms(orig_y, wm_y)


# -----------------------------
# 9. Example Usage
# -----------------------------
if __name__ == "__main__":
    evaluate("original.png", "watermarked.png")