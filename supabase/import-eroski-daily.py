from __future__ import annotations
import argparse,json,os
from datetime import datetime,timezone
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.error import HTTPError
BATCH=200
def call(base,key,table,method,payload=None,query=''):
 data=None if payload is None else json.dumps(payload,ensure_ascii=False).encode(); h={'apikey':key,'Authorization':f'Bearer {key}'}
 if payload is not None:h['Content-Type']='application/json'
 if method=='POST':h['Prefer']='resolution=merge-duplicates,return=minimal'
 try:
  with urlopen(Request(f'{base}/rest/v1/{table}{query}',data=data,method=method,headers=h),timeout=90) as r:return json.loads(r.read() or b'[]')
 except HTTPError as e:raise RuntimeError(f'{table}: HTTP {e.code}: {e.read().decode(errors="replace")[:700]}')
def main():
 a=argparse.ArgumentParser();a.add_argument('--catalog',required=True);a.add_argument('--apply',action='store_true');a.add_argument('--complete-scan',action='store_true');a.add_argument('--batch-size',type=int,default=BATCH);x=a.parse_args(); d=json.loads(Path(x.catalog).read_text(encoding='utf-8')); ps=d.get('products',[])
 if d.get('store_key')!='eroski' or not ps:raise SystemExit('Catálogo Eroski vacío o inválido')
 base=os.getenv('SUPABASE_URL','').rstrip('/');key=os.getenv('SUPABASE_SERVICE_ROLE_KEY','')
 if x.apply and(not base or not key):raise SystemExit('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY')
 now=datetime.now(timezone.utc).isoformat(); rows=[{'store_key':'eroski','provider_key':'scrapling','query_term':p.get('query_term'),'external_id':str(p['external_id']),'ean':p.get('ean'),'name':p['name'],'brand':p.get('brand'),'category':p.get('category'),'image_url':p.get('image_url'),'product_url':p.get('product_url'),'price':p.get('price'),'reference_price':p.get('reference_price'),'reference_format':p.get('reference_format'),'packaging':p.get('packaging'),'captured_at':p.get('captured_at') or now,'is_active':True,'raw':p.get('raw') or {},'updated_at':now} for p in ps]
 print(json.dumps({'mode':'apply' if x.apply else 'dry-run','products':len(rows),'complete_scan':x.complete_scan},ensure_ascii=False),flush=True)
 if not x.apply:return
 old={}
 for i in range(0,len(rows),x.batch_size):
  ids=','.join('"'+r['external_id']+'"' for r in rows[i:i+x.batch_size]);old.update({r['external_id']:r for r in call(base,key,'store_catalog_products','GET',query=f'?select=id,external_id,price,reference_price,is_active&store_key=eq.eroski&external_id=in.({ids})')})
 for i in range(0,len(rows),x.batch_size):call(base,key,'store_catalog_products','POST',rows[i:i+x.batch_size],'?on_conflict=store_key,external_id');print(f'productos {min(i+x.batch_size,len(rows))}/{len(rows)}',flush=True)
 ids={r['external_id'] for r in rows}; lookup=[]
 for i in range(0,len(rows),x.batch_size):
  chunk={r['external_id'] for r in rows[i:i+x.batch_size]}; q='?select=id,external_id&store_key=eq.eroski&external_id=in.('+','.join('\"'+j+'\"' for j in chunk)+')'; lookup.extend(call(base,key,'store_catalog_products','GET',query=q))
 by={r['external_id']:r['id'] for r in lookup};hist=[{'store_catalog_product_id':by[r['external_id']],'store_key':'eroski','provider_key':'scrapling','price':r['price'],'reference_price':r['reference_price'],'reference_format':r['reference_format'],'captured_at':r['captured_at']} for r in rows if r['external_id'] in by and(r['external_id'] not in old or old[r['external_id']].get('price')!=r.get('price') or old[r['external_id']].get('reference_price')!=r.get('reference_price'))]
 for i in range(0,len(hist),x.batch_size):call(base,key,'store_catalog_price_history','POST',hist[i:i+x.batch_size]);print(f'historial {min(i+x.batch_size,len(hist))}/{len(hist)}',flush=True)
 if x.complete_scan:call(base,key,'store_catalog_products','PATCH',{'is_active':False,'updated_at':now},'?store_key=eq.eroski&external_id=not.in.('+','.join('"'+i+'"' for i in ids)+')')
 print(json.dumps({'completed':True,'new':sum(i not in old for i in ids),'price_changes':len(hist),'history_rows':len(hist),'complete_scan':x.complete_scan},ensure_ascii=False))
if __name__=='__main__':main()
