import os
from pathlib import Path
from typing import Dict, List, Optional, Set

DEFAULT_DOCKER_ROOT = Path(__file__).resolve().parent / "docker"
DEFAULT_CODE_SERVER_BUILD_CONTEXT = Path(
    os.environ.get(
        "COMPUTEX_CODE_BUILD_CONTEXT",
        str(DEFAULT_DOCKER_ROOT / "code-server"),
    )
)

DEFAULT_PYTHON_INTERPRETER_CONTEXT = Path(
    os.environ.get(
        "COMPUTEX_CODE_PYTHON_INTERPRETER_CONTEXT",
        str(DEFAULT_DOCKER_ROOT / "presets" / "python-interpreter"),
    )
)
LEGACY_PYTHON_CONTEXT = DEFAULT_DOCKER_ROOT / "presets" / "python"
DEFAULT_PYTHON_CONTEXT = (
    LEGACY_PYTHON_CONTEXT
    if LEGACY_PYTHON_CONTEXT.exists()
    else DEFAULT_PYTHON_INTERPRETER_CONTEXT
)

DEFAULT_IMAGE_BUILD_CONTEXTS: Dict[str, Path] = {
    "computex-code": DEFAULT_CODE_SERVER_BUILD_CONTEXT,
    "computex-python-interpreter": DEFAULT_PYTHON_INTERPRETER_CONTEXT,
    "computex-python": DEFAULT_PYTHON_CONTEXT,
    "computex-node": DEFAULT_DOCKER_ROOT / "presets" / "node",
    "computex-flutter": DEFAULT_DOCKER_ROOT / "presets" / "flutter",
    "computex-fullstack": DEFAULT_DOCKER_ROOT / "presets" / "fullstack",
    "computex-data": DEFAULT_DOCKER_ROOT / "presets" / "data",
    "computex-go": DEFAULT_DOCKER_ROOT / "presets" / "go",
    "computex-rust": DEFAULT_DOCKER_ROOT / "presets" / "rust",
    "computex-java": DEFAULT_DOCKER_ROOT / "presets" / "java",
    "computex-cpp": DEFAULT_DOCKER_ROOT / "presets" / "cpp",
    "computex-php": DEFAULT_DOCKER_ROOT / "presets" / "php",
    "computex-dotnet": DEFAULT_DOCKER_ROOT / "presets" / "dotnet",
    "computex-devops": DEFAULT_DOCKER_ROOT / "presets" / "devops",
}

PYTHON_READY_IMAGES: Set[str] = {
    "computex-python-interpreter",
    "computex-python",
    "computex-data",
    "computex-fullstack",
    "computex-devops",
}


def resolve_build_context_for_image(image: str) -> Optional[Path]:
    context = DEFAULT_IMAGE_BUILD_CONTEXTS.get(image)
    if context and context.exists():
        return context
    fallback = DEFAULT_IMAGE_BUILD_CONTEXTS.get("computex-code")
    if fallback and fallback.exists():
        return fallback
    return None


def is_python_ready_image(image: str) -> bool:
    return image in PYTHON_READY_IMAGES


def get_coding_image_catalog() -> List[str]:
    # Warmup keeps startup quick while preparing a Python-capable image by default.
    default_images = ["computex-code", "computex-python-interpreter"]
    if os.environ.get("COMPUTEX_PREBUILD_ALL_IMAGES", "").lower() in ("1", "true", "yes", "on"):
        default_images = list(DEFAULT_IMAGE_BUILD_CONTEXTS.keys())

    configured = os.environ.get("COMPUTEX_CODING_IMAGE_CATALOG", "")
    if not configured.strip():
        return default_images

    requested = [item.strip() for item in configured.split(",") if item.strip()]
    deduped: List[str] = []
    for image in requested:
        if image not in deduped:
            deduped.append(image)
    return deduped or default_images
