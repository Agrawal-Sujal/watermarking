import numpy as np
import cv2

def normalized_correlation(w1, w2):
    # flatten
    w1 = w1.flatten().astype(np.float64)
    w2 = w2.flatten().astype(np.float64)

    # avoid division by zero
    denom = np.sqrt(np.sum(w1**2) * np.sum(w2**2))
    if denom == 0:
        return 0.0

    return np.sum(w1 * w2) / denom


if __name__ == "__main__":
    import argparse, sys

    parser = argparse.ArgumentParser(
        description="Compute Normalized Correlation (NC)"
    )

    sub = parser.add_subparsers(dest="cmd")

    # nc command
    ext = sub.add_parser("nc")
    ext.add_argument("w1", help="Path to original watermark image")
    ext.add_argument("w2", help="Path to extracted watermark image")

    args = parser.parse_args()

    if args.cmd == "nc":

        # ✅ LOAD IMAGES (IMPORTANT)
        w1 = cv2.imread(args.w1, cv2.IMREAD_GRAYSCALE)
        w2 = cv2.imread(args.w2, cv2.IMREAD_GRAYSCALE)

        if w1 is None or w2 is None:
            print("Error: Could not load one of the images")
            sys.exit(1)

        # ✅ ensure same size
        if w1.shape != w2.shape:
            print("Resizing extracted watermark to match original...")
            w2 = cv2.resize(w2, (w1.shape[1], w1.shape[0]))

        nc = normalized_correlation(w1, w2)

        print(f"NC = {nc:.6f}")

    else:
        parser.print_help()
        sys.exit(1)