import os
import subprocess
import tempfile
import time
from dataclasses import dataclass, field


@dataclass
class ExecutionResult:
    stdout: str = ""
    stderr: str = ""
    exit_code: int = 0
    duration_ms: int = 0
    output_files: list[str] = field(default_factory=list)


BLOCKED_PATTERNS = [
    "import os",
    "import sys",
    "import subprocess",
    "import socket",
    "import requests",
    "__import__",
    "open(",
    "exec(",
    "eval(",
    "compile(",
    "__builtins__",
    "importlib",
    "shutil",
    "pathlib",
]


def execute(code: str, input_files: dict[str, str], timeout: int = 30) -> ExecutionResult:
    for pattern in BLOCKED_PATTERNS:
        if pattern in code:
            return ExecutionResult(
                stdout="",
                stderr=f"Blocked pattern detected: '{pattern}'. This code is not allowed for security reasons.",
                exit_code=1,
                duration_ms=0,
                output_files=[],
            )

    preamble_lines = [
        "import rasterio",
        "import numpy as np",
        "import geopandas as gpd",
        "import matplotlib",
        "matplotlib.use('Agg')",
        "import matplotlib.pyplot as plt",
        "import json",
        "import os",
        "OUTPUT_DIR = '/tmp/geo_output'",
        "os.makedirs(OUTPUT_DIR, exist_ok=True)",
    ]

    for var_name, file_path in input_files.items():
        preamble_lines.append(f"{var_name} = {file_path!r}")

    preamble = "\n".join(preamble_lines) + "\n"
    full_code = preamble + code

    script_file = None
    start = time.time()
    try:
        with tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False) as f:
            script_file = f.name
            f.write(full_code)
            f.flush()

        result = subprocess.run(
            ["python3", script_file],
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        elapsed = int((time.time() - start) * 1000)
        stdout = result.stdout[:10000]
        stderr = result.stderr[:5000]
        exit_code = result.returncode
    except subprocess.TimeoutExpired:
        elapsed = int((time.time() - start) * 1000)
        stdout = ""
        stderr = f"Execution timed out after {timeout} seconds."
        exit_code = 1
    finally:
        if script_file and os.path.exists(script_file):
            os.unlink(script_file)

    output_files = []
    if os.path.isdir("/tmp/geo_output"):
        for root, _dirs, files in os.walk("/tmp/geo_output"):
            for file in files:
                output_files.append(os.path.join(root, file))

    return ExecutionResult(
        stdout=stdout,
        stderr=stderr,
        exit_code=exit_code,
        duration_ms=elapsed,
        output_files=output_files,
    )
