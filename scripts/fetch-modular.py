"""Fetch just the reviewed CC0 modular assets; generated public files are deployable offline."""
import concurrent.futures, json, re, urllib.request, zipfile, io
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
CACHE=ROOT/'.tools'/'modular-audit'
CACHE.mkdir(parents=True,exist_ok=True)
def get(url, referer='https://3dassets.dev/'):
    return urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0','Referer':referer}),timeout=60).read()

for slug in ['mega-weapon-pack','mech-hangar-and-battle-frames']:
    file=CACHE/(slug+'.json')
    if not file.exists(): file.write_bytes(get('https://3dassets.dev/api/v1/packs/'+slug))

# Keep this list aligned with modular-sources.ts. Fetching the complete weapon
# pack would waste >150 MB; the app uses these individual pieces only.
IDS=[26791,26808,26807,26829,26833,26851,26855,26862,26876,26877,26888,26889,26891,26898,26901,
     33316,33296,33365,33366,33368,33373,33375,33377,33379,33380,33383,33381,33384,33385,33386,33387,33388,33390,33389,33391,33393,33392]
def fetch(aid):
    for remote,suffix in [('model.glb','.glb'),('thumb.webp','.webp')]:
        file=CACHE/(str(aid)+suffix)
        if not file.exists():file.write_bytes(get(f'https://cdn.3dassets.dev/assets/{aid}/v1/{remote}'))
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:list(pool.map(fetch,IDS))

archive=CACHE/'car-kit.zip'
if not archive.exists() or archive.read_bytes()[:2]!=b'PK':
    page=get('https://kenney.nl/assets/car-kit','https://kenney.nl/').decode()
    ident=re.search("data-download-id='([^']+)'",page).group(1)
    # The short-lived public download URL stays in memory, never in source/logs.
    signed=json.loads(get('https://kenney.nl/download-link/'+ident,'https://kenney.nl/assets/car-kit'))['url']
    archive.write_bytes(get(signed,'https://kenney.nl/assets/car-kit'))
with zipfile.ZipFile(archive) as z:
    for name in ['sedan','wheel-default','wheel-racing','wheel-dark']:
        (CACHE/('car-'+name+'.glb')).write_bytes(z.read('Models/GLB format/'+name+'.glb'))
    license_dir=ROOT/'public'/'licenses';license_dir.mkdir(exist_ok=True)
    (license_dir/'kenney-car-kit.txt').write_bytes(z.read('License.txt'))
print('Reviewed modular sources and CC0 license ready.')
