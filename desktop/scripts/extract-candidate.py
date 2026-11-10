"""Extract only approved regular files; never unpack candidate code or links."""
import json
from pathlib import Path, PurePosixPath
import shutil
import stat
import sys
import zipfile


def extract(archive, destination, files):
    destination = Path(destination)
    destination.mkdir(mode=0o700, parents=True, exist_ok=False)
    with zipfile.ZipFile(archive) as bundle:
        entries = bundle.infolist()
        names = [entry.filename for entry in entries]
        if len(entries) > 10000 or len(set(names)) != len(names):
            raise ValueError("Duplicate or excessive artifact entries")
        for name in names:
            if "\\" in name or PurePosixPath(name).is_absolute() or ".." in PurePosixPath(name).parts:
                raise ValueError("Unsafe artifact path")
        for file in files:
            name = file["name"]
            if Path(name).name != name or name in (".", ".."):
                raise ValueError("Expected a flat approved candidate file")
            entry = bundle.getinfo(name)
            mode = entry.external_attr >> 16
            if entry.is_dir() or stat.S_ISLNK(mode) or (stat.S_IFMT(mode) not in (0, stat.S_IFREG)):
                raise ValueError("Candidate is not a regular file")
            if entry.file_size != file["bytes"] or not 0 < entry.file_size <= 1024**3:
                raise ValueError("Candidate size differs from approval")
            with bundle.open(entry) as source, (destination / name).open("xb") as output:
                shutil.copyfileobj(source, output, length=1024 * 1024)


if __name__ == "__main__":
    extract(sys.argv[1], sys.argv[2], json.loads(Path(sys.argv[3]).read_text()))
