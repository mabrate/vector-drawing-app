#!/usr/bin/env python3
"""Refresh the curated fonts and bundled basics; runtime needs no API key.
Run explicitly with network access. Downloads CSS metadata, not the full catalog's fonts.
"""
import concurrent.futures,json,re,time,urllib.request,urllib.parse,urllib.error,shutil
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'public/fonts';OUT.mkdir(exist_ok=True)
CURATED={
'Arimo':('Basics','Arial-compatible sans serif'), 'Tinos':('Basics','Classic serif'), 'Cousine':('Basics','Monospaced text'),
'Roboto':('Signs & explainers','Everyday readable text'), 'Atkinson Hyperlegible':('Signs & explainers','Clear, distinctive letterforms'), 'Nunito':('Signs & explainers','Friendly rounded text'), 'Oswald':('Signs & explainers','Tall sign headings'), 'Bebas Neue':('Signs & explainers','Condensed capitals'),
'Anton':('Chunky lettering','Heavy sign lettering'), 'Bungee':('Chunky lettering','Bold block lettering'), 'Lilita One':('Chunky lettering','Thick rounded lettering'), 'Archivo Black':('Chunky lettering','Heavy wide lettering'),
'Press Start 2P':('Games','Retro pixel lettering'), 'Black Ops One':('Games','Stencil-style game titles'), 'Orbitron':('Games','Futuristic game titles'),
'Fredoka':('Fun & handwriting','Rounded playful lettering'), 'Chewy':('Fun & handwriting','Cartoon-style lettering'), 'Patrick Hand':('Fun & handwriting','Friendly handwritten notes'), 'Baloo 2':('Chunky lettering','Bold rounded lettering'), 'VT323':('Games','Retro terminal game lettering')}
def fetch(url):
 for attempt in range(3):
  try:
   request=urllib.request.Request(url,headers={'User-Agent':'VectorLabFontCatalog/1.0'})
   with urllib.request.urlopen(request,timeout=60) as r:return r.read()
  except Exception as error:
   if isinstance(error,urllib.error.HTTPError) and error.code==404:raise
   if attempt==2:raise
   time.sleep(1+attempt)
def main():
 raw=fetch('https://fonts.google.com/metadata/fonts').decode();metadata=json.loads(raw[raw.index('{'):])['familyMetadataList']
 entries=[]
 for f in metadata:
  if f['family'] not in CURATED:continue
  weights=sorted(int(w) for w in f['fonts'] if w.isdigit())
  if not weights:continue
  normal=min(weights,key=lambda w:abs(w-400));bold=min(weights,key=lambda w:abs(w-700))
  entries.append({'family':f['family'],'category':f['category'],'weights':[str(w)+suffix for w in sorted(set([normal,bold])) for suffix in ['', 'i'] if str(w)+suffix in f['fonts']],'files':{}})
 def batch(group):
  query='|'.join(e['family']+':'+','.join(e['weights']) for e in group)
  css=fetch('https://fonts.googleapis.com/css?family='+urllib.parse.quote(query,safe=':,|')).decode()
  for block in re.findall(r'@font-face\s*\{([^}]+)\}',css):
   name=re.search(r"font-family:\s*['\"]([^'\"]+)",block);weight=re.search(r'font-weight:\s*(\d+)',block);url=re.search(r'url\((https://[^)]+)\)',block)
   if name and weight and url:
    for e in group:
     if e['family']==name[1]:e['files'][weight[1]+('i' if 'font-style: italic' in block else '')]=url[1]
  return group
 groups=[entries[i:i+25] for i in range(0,len(entries),25)]
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
  for index,result in enumerate(pool.map(batch,groups)):print(f'Catalog batch {index+1}/{len(groups)}',flush=True)
 for e in entries:
  e['normal']=str(min((int(w) for w in e.pop('weights') if not w.endswith('i')),key=lambda w:abs(w-400))); e['bold']=min((w for w in e['files'] if not w.endswith('i')),key=lambda w:abs(int(w)-700)) if e['files'] else e['normal']
  e['group'],e['description']=CURATED[e['family']];e['bundled']=e['group']=='Basics'
  slug=re.sub('[^a-z0-9]','',e['family'].lower())
  if e['bundled']:
   (OUT/slug).mkdir(exist_ok=True)
   for weight,url in list(e['files'].items()):
    dest=OUT/slug/(weight+'.ttf');dest.write_bytes(fetch(url));e['files'][weight]='fonts/'+slug+'/'+weight+'.ttf'
  elif (OUT/slug).exists():
   # These were created only by this script; downloadable fonts do not ship locally.
   shutil.rmtree(OUT/slug)
  license_data=None
  for url in [f'https://raw.githubusercontent.com/google/fonts/main/ofl/{slug}/OFL.txt',f'https://raw.githubusercontent.com/google/fonts/main/apache/{slug}/LICENSE.txt',f'https://raw.githubusercontent.com/googlefonts/{slug}/main/OFL.txt',f'https://raw.githubusercontent.com/googlefonts/{slug}/master/OFL.txt']:
   try:license_data=fetch(url);break
   except Exception:pass
  if not license_data:raise RuntimeError('Missing license: '+e['family'])
  licenses=OUT/'licenses';licenses.mkdir(exist_ok=True);(licenses/(slug+'.txt')).write_bytes(license_data)
  preview_css=fetch('https://fonts.googleapis.com/css?family='+urllib.parse.quote(e['family']+':'+e['normal'])+'&text='+urllib.parse.quote(e['family'])).decode()
  preview_url=re.search(r'url\((https://[^)]+)\)',preview_css)[1]
  preview_path=OUT/'previews';preview_path.mkdir(exist_ok=True)
  (preview_path/(slug+'.ttf')).write_bytes(fetch(preview_url));e['preview']='fonts/previews/'+slug+'.ttf'
  e['license']='fonts/licenses/'+slug+'.txt';e['source']='https://fonts.google.com/specimen/'+urllib.parse.quote(e['family'])
  if not e['files']:raise RuntimeError('No font files: '+e['family'])
 output={'updated':datetime.now(ZoneInfo('America/Chicago')).date().isoformat(),'source':'https://fonts.google.com/','fonts':entries}
 (OUT/'catalog.json').write_text(json.dumps(output,separators=(',',':')))
 print(f'Saved {len(entries)} catalog families, 3 bundled basics and {len(entries)-3} downloadable families',flush=True)
if __name__=='__main__':main()
