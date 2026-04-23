import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from docker_manager import DockerManager


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run end-to-end Node.js runtime healthchecks in a ComputeX Docker image."
    )
    parser.add_argument(
        "--image",
        default="computex-node-interpreter",
        help="Image to test (default: computex-node-interpreter).",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    docker = DockerManager()
    ok, message = docker.connect()
    print(message)
    if not ok:
        return 1

    ok, message, meta = docker.verify_node_runtime(image=args.image)
    print(message)
    if meta:
        print(json.dumps(meta, indent=2))
    return 0 if ok else 2


if __name__ == "__main__":
    raise SystemExit(main())
