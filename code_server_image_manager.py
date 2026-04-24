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

DEFAULT_NODE_INTERPRETER_CONTEXT = Path(
    os.environ.get(
        "COMPUTEX_CODE_NODE_INTERPRETER_CONTEXT",
        str(DEFAULT_DOCKER_ROOT / "presets" / "node-interpreter"),
    )
)
LEGACY_NODE_CONTEXT = DEFAULT_DOCKER_ROOT / "presets" / "node"
DEFAULT_NODE_CONTEXT = (
    LEGACY_NODE_CONTEXT if LEGACY_NODE_CONTEXT.exists() else DEFAULT_NODE_INTERPRETER_CONTEXT
)

DEFAULT_PHP_INTERPRETER_CONTEXT = Path(
    os.environ.get(
        "COMPUTEX_CODE_PHP_INTERPRETER_CONTEXT",
        str(DEFAULT_DOCKER_ROOT / "presets" / "php-interpreter"),
    )
)
LEGACY_PHP_CONTEXT = DEFAULT_DOCKER_ROOT / "presets" / "php"
DEFAULT_PHP_CONTEXT = (
    LEGACY_PHP_CONTEXT if LEGACY_PHP_CONTEXT.exists() else DEFAULT_PHP_INTERPRETER_CONTEXT
)

DEFAULT_JAVA_INTERPRETER_CONTEXT = Path(
    os.environ.get(
        "COMPUTEX_CODE_JAVA_INTERPRETER_CONTEXT",
        str(DEFAULT_DOCKER_ROOT / "presets" / "java-interpreter"),
    )
)
LEGACY_JAVA_CONTEXT = DEFAULT_DOCKER_ROOT / "presets" / "java"
DEFAULT_JAVA_CONTEXT = (
    LEGACY_JAVA_CONTEXT if LEGACY_JAVA_CONTEXT.exists() else DEFAULT_JAVA_INTERPRETER_CONTEXT
)

DEFAULT_CPP_INTERPRETER_CONTEXT = Path(
    os.environ.get(
        "COMPUTEX_CODE_CPP_INTERPRETER_CONTEXT",
        str(DEFAULT_DOCKER_ROOT / "presets" / "cpp-interpreter"),
    )
)
LEGACY_CPP_CONTEXT = DEFAULT_DOCKER_ROOT / "presets" / "cpp"
DEFAULT_CPP_CONTEXT = (
    LEGACY_CPP_CONTEXT if LEGACY_CPP_CONTEXT.exists() else DEFAULT_CPP_INTERPRETER_CONTEXT
)

DEFAULT_IMAGE_BUILD_CONTEXTS: Dict[str, Path] = {
    "computex-code": DEFAULT_CODE_SERVER_BUILD_CONTEXT,
    "computex-clean": DEFAULT_CODE_SERVER_BUILD_CONTEXT,
    "computex-python-interpreter": DEFAULT_PYTHON_INTERPRETER_CONTEXT,
    "computex-python": DEFAULT_PYTHON_CONTEXT,
    "computex-node-interpreter": DEFAULT_NODE_INTERPRETER_CONTEXT,
    "computex-node": DEFAULT_NODE_CONTEXT,
    "computex-php-interpreter": DEFAULT_PHP_INTERPRETER_CONTEXT,
    "computex-php": DEFAULT_PHP_CONTEXT,
    "computex-java-interpreter": DEFAULT_JAVA_INTERPRETER_CONTEXT,
    "computex-java": DEFAULT_JAVA_CONTEXT,
    "computex-cpp-interpreter": DEFAULT_CPP_INTERPRETER_CONTEXT,
    "computex-cpp": DEFAULT_CPP_CONTEXT,
    "computex-flutter": DEFAULT_DOCKER_ROOT / "presets" / "flutter",
    "computex-fullstack": DEFAULT_DOCKER_ROOT / "presets" / "fullstack",
    "computex-data": DEFAULT_DOCKER_ROOT / "presets" / "data",
    "computex-go": DEFAULT_DOCKER_ROOT / "presets" / "go",
    "computex-rust": DEFAULT_DOCKER_ROOT / "presets" / "rust",
    "computex-cpp": DEFAULT_DOCKER_ROOT / "presets" / "cpp",
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

NODE_READY_IMAGES: Set[str] = {
    "computex-node-interpreter",
    "computex-node",
    "computex-fullstack",
    "computex-devops",
}

PHP_READY_IMAGES: Set[str] = {
    "computex-php-interpreter",
    "computex-php",
}

JAVA_READY_IMAGES: Set[str] = {
    "computex-java-interpreter",
    "computex-java",
}

CPP_READY_IMAGES: Set[str] = {
    "computex-cpp-interpreter",
    "computex-cpp",
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


def is_node_ready_image(image: str) -> bool:
    return image in NODE_READY_IMAGES


def is_php_ready_image(image: str) -> bool:
    return image in PHP_READY_IMAGES


def is_java_ready_image(image: str) -> bool:
    return image in JAVA_READY_IMAGES


def is_cpp_ready_image(image: str) -> bool:
    return image in CPP_READY_IMAGES


def get_coding_image_catalog() -> List[str]:
    # Warmup keeps startup quick while preparing core coding presets by default.
    default_images = [
        "computex-code",
        "computex-clean",
        "computex-python-interpreter",
        "computex-node-interpreter",
        "computex-php-interpreter",
        "computex-java-interpreter",
        "computex-cpp-interpreter",
    ]
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
