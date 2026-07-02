import time
from pathlib import Path

OUTPUT_DIR = Path(__file__).parent / "output"
DEFAULT_MAX_AGE_DAYS = 7


def cleanup_output(max_age_days=DEFAULT_MAX_AGE_DAYS):
    """Supprime les fichiers d'export plus vieux que max_age_days."""
    if not OUTPUT_DIR.is_dir():
        return 0
    cutoff = time.time() - max_age_days * 86400
    removed = 0
    for path in sorted(OUTPUT_DIR.rglob("*"), reverse=True):
        try:
            if path.is_file() and path.stat().st_mtime < cutoff:
                path.unlink()
                removed += 1
            elif path.is_dir() and not any(path.iterdir()):
                path.rmdir()
        except OSError:
            continue
    return removed
