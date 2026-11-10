"""Download the small CC0 subset used by the workshop. Python standard library only."""
import concurrent.futures
import json
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
FILES = {
    'cruiser': 19147,
    'engine-small': 19155,
    'engine-medium': 19156,
    'engine-large': 19157,
    'turret-single': 19159,
    'turret-twin': 19160,
    'turret-spinal': 19162,
    'missile-pod': 19161,
    'radar': 19165,
    'sensor': 19167,
    'communications': 19178,
    'cargo': 19166,
    'fuel': 19168,
    'drone-rack': 19172,
}


def download(item):
    name, asset_id = item
    folder = ROOT / 'public' / 'models'
    folder.mkdir(parents=True, exist_ok=True)
    for remote, suffix in [('model.glb', '.glb'), ('thumb.webp', '.webp')]:
        target = folder / f'{name}{suffix}'
        if target.exists() and target.stat().st_size:
            continue
        url = f'https://cdn.3dassets.dev/assets/{asset_id}/v1/{remote}'
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0', 'Referer': 'https://3dassets.dev/'})
        data = urllib.request.urlopen(req, timeout=60).read()
        target.write_bytes(data)
    print(f'Downloaded {name}', flush=True)


if __name__ == '__main__':
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        list(executor.map(download, FILES.items()))
    folder = ROOT / 'public' / 'hand'
    folder.mkdir(parents=True, exist_ok=True)
    task = folder / 'hand_landmarker.task'
    if not task.exists():
        urllib.request.urlretrieve(
            'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task', task)
    print('Hand model ready', flush=True)
