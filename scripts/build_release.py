#!/usr/bin/env python3
"""Build the website's Skill and example-plugin downloads; never publish them."""

import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import zipfile


ROOT = Path(__file__).resolve().parents[1]
SKILL_NAME = "inscura-scraper-plugin"
FILES = (
    "SKILL.md", "README.md", "README-zh.md", "LICENSE", ".gitignore", "agents/openai.yaml",
    "references/plugin-contract.md", "references/result-types.md", "references/tvmaze.md",
    "references/verification.md",
    "assets/tvmaze/manifest.json", "assets/tvmaze/index.js", "assets/tvmaze/ATTRIBUTION.md",
    "assets/tvmaze/LICENSE",
    "scripts/plugin_tool.py", "scripts/build_release.py", "scripts/check_result.py",
)


def build(output, node_check):
    for name in FILES:
        path = ROOT / name
        if not path.is_file() or path.is_symlink():
            raise ValueError("Missing or symlinked release source: " + name)
    manifest = json.loads((ROOT / "assets/tvmaze/manifest.json").read_text(encoding="utf-8"))
    tool = ROOT / "scripts/plugin_tool.py"
    example = ROOT / "assets/tvmaze"
    flags = ["--node-check"] if node_check else []
    subprocess.run([sys.executable, str(tool), "validate", str(example)] + flags, check=True)

    output.mkdir(parents=True, exist_ok=True)
    plugin_name = manifest["id"] + "-v" + manifest["version"] + ".zip"
    names = [SKILL_NAME + ".zip", plugin_name, "SHA256SUMS"]
    for name in names:
        if (output / name).exists() or (output / name).is_symlink():
            raise ValueError("Refusing to overwrite " + str(output / name))

    with tempfile.TemporaryDirectory(prefix="inscura-release-") as temporary:
        stage = Path(temporary)
        subprocess.run([sys.executable, str(tool), "package", str(example), str(stage / plugin_name)], check=True)
        with zipfile.ZipFile(stage / names[0], "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for name in FILES:
                info = zipfile.ZipInfo(SKILL_NAME + "/" + name, date_time=(2026, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.create_system = 3
                info.external_attr = 0o100644 << 16
                archive.writestr(info, (ROOT / name).read_bytes())
        checksum_lines = [
            hashlib.sha256((stage / name).read_bytes()).hexdigest() + "  " + name
            for name in names[:2]
        ]
        (stage / "SHA256SUMS").write_text("\n".join(checksum_lines) + "\n", encoding="utf-8")
        for name in names:
            with (output / name).open("xb") as destination:
                destination.write((stage / name).read_bytes())
    print(json.dumps({"files": [str((output / name).resolve()) for name in names],
                      "nodeSyntaxChecked": node_check,
                      "applicationTested": False}, ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=ROOT / "dist")
    parser.add_argument("--node-check", action="store_true", help="Also parse JavaScript using Node (does not execute it)")
    args = parser.parse_args()
    try:
        build(args.output_dir, args.node_check)
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        print("Build failed: " + str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
