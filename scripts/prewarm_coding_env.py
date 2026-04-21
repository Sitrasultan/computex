import argparse
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from docker_manager import DockerManager


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Pre-build ComputeX coding images so code server startup is faster."
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Force image rebuild even if images are already present.",
    )
    parser.add_argument(
        "--all-images",
        action="store_true",
        help="Prepare all known coding images instead of the default warmup set.",
    )
    parser.add_argument(
        "--images",
        default="",
        help="Optional comma-separated image list (overrides default catalog).",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    if args.all_images:
        os.environ["COMPUTEX_PREBUILD_ALL_IMAGES"] = "1"

    if args.images.strip():
        os.environ["COMPUTEX_CODING_IMAGE_CATALOG"] = args.images

    docker = DockerManager()
    ok, message = docker.connect()
    print(message)
    if not ok:
        return 1

    ok, message = docker.prepare_coding_images(force=args.force)
    print(message)
    return 0 if ok else 2


if __name__ == "__main__":
    raise SystemExit(main())
