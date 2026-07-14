"""Generate favicon, PWA icons, and Windows ICO from the master transparent logo."""
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / "release" / "assets" / "faceace-logo.png"
PUBLIC = ROOT / "frontend" / "public"
ASSETS = ROOT / "release" / "assets"


def main() -> None:
    PUBLIC.mkdir(parents=True, exist_ok=True)
    ASSETS.mkdir(parents=True, exist_ok=True)
    image = Image.open(MASTER).convert("RGBA")

    image.resize((512, 512), Image.Resampling.LANCZOS).save(PUBLIC / "icon-512.png")
    image.resize((192, 192), Image.Resampling.LANCZOS).save(PUBLIC / "icon-192.png")
    image.resize((64, 64), Image.Resampling.LANCZOS).save(PUBLIC / "favicon-64.png")

    ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    image.save(PUBLIC / "favicon.ico", format="ICO", sizes=ico_sizes)
    image.save(ASSETS / "faceace.ico", format="ICO", sizes=ico_sizes)


if __name__ == "__main__":
    main()
