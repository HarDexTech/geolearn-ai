import ast
import os
import subprocess
import sys
import tempfile
import time
import uuid
from dataclasses import dataclass, field

try:
    import resource
except ImportError:
    resource = None


@dataclass
class ExecutionResult:
    stdout: str = ""
    stderr: str = ""
    exit_code: int = 0
    duration_ms: int = 0
    output_files: list[str] = field(default_factory=list)


_BLOCKED_MODULES = {
    "os", "sys", "subprocess", "socket", "requests", "shutil", "pathlib",
    "urllib", "http", "ftplib", "ssl", "ctypes", "multiprocessing",
    "threading", "pickle", "marshal", "pty", "fcntl", "signal",
    "importlib", "code",
}

_BLOCKED_NAMES = {
    "eval", "exec", "compile", "open", "__import__", "__builtins__",
    "globals", "vars", "getattr", "setattr", "delattr", "locals",
    "breakpoint", "input",
}

_BLOCKED_ATTRS = {
    "__globals__", "__class__", "__bases__", "__subclasses__",
    "__builtins__", "__code__", "__closure__", "__dict__",
}


def _find_violation(code: str) -> str | None:
    try:
        tree = ast.parse(code, mode="exec")
    except SyntaxError as exc:
        return f"Syntax error: {exc}"

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                mod = alias.name.split(".")[0]
                if mod in _BLOCKED_MODULES:
                    return f"Blocked module: '{alias.name}'"

        elif isinstance(node, ast.ImportFrom):
            if node.module is not None:
                mod = node.module.split(".")[0]
                if mod in _BLOCKED_MODULES:
                    return f"Blocked module: '{node.module}'"

        elif isinstance(node, ast.Name):
            if node.id in _BLOCKED_NAMES or node.id in _BLOCKED_MODULES:
                return f"Blocked name: '{node.id}'"

        elif isinstance(node, ast.Attribute):
            if node.attr in _BLOCKED_ATTRS:
                return f"Blocked attribute access: '{node.attr}'"

    return None


def _build_minimal_env() -> dict[str, str]:
    return {
        "PATH": "/usr/bin:/bin",
        "LANG": "C.UTF-8",
        "LC_ALL": "C.UTF-8",
    }


def execute(code: str, input_files: dict[str, str], timeout: int = 30) -> ExecutionResult:
    violation = _find_violation(code)
    if violation is not None:
        return ExecutionResult(
            stdout="",
            stderr=violation,
            exit_code=1,
            duration_ms=0,
            output_files=[],
        )

    exec_id = uuid.uuid4().hex
    output_dir = f"/tmp/geo_output/{exec_id}"
    os.makedirs(output_dir, exist_ok=True)

    preamble_lines = [
        "import rasterio",
        "import numpy as np",
        "import geopandas as gpd",
        "import matplotlib",
        "matplotlib.use('Agg')",
        "import matplotlib.pyplot as plt",
        "import json",
        f"OUTPUT_DIR = '{output_dir}'",
    ]

    for var_name, file_path in input_files.items():
        if not var_name.isidentifier():
            continue
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

        cmd = [sys.executable, "-I", script_file]
        env = _build_minimal_env()

        run_kwargs: dict = {
            "capture_output": True,
            "text": True,
            "timeout": timeout,
            "env": env,
            "cwd": tempfile.gettempdir(),
        }

        if os.name == "posix" and resource is not None:
            def _set_limits():
                resource.setrlimit(resource.RLIMIT_AS, (512 * 1024 * 1024, 512 * 1024 * 1024))
                resource.setrlimit(resource.RLIMIT_CPU, (timeout, timeout))
                resource.setrlimit(resource.RLIMIT_NPROC, (10, 10))
                resource.setrlimit(resource.RLIMIT_NOFILE, (64, 64))

            run_kwargs["preexec_fn"] = _set_limits

        result = subprocess.run(cmd, **run_kwargs)
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
    if os.path.isdir(output_dir):
        for root, _dirs, files in os.walk(output_dir):
            for file in files:
                output_files.append(os.path.join(root, file))

    return ExecutionResult(
        stdout=stdout,
        stderr=stderr,
        exit_code=exit_code,
        duration_ms=elapsed,
        output_files=output_files,
    )
