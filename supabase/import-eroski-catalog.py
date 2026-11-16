from __future__ import annotations
import argparse,json,os,sys,time
from datetime import datetime,timezone
from urllib.request import Request,urlopen
from urllib.error import HTTPError,URLError
from pathlib import Path

BATCH=200

def api(url, key, table, method, body, params=''):
    req=Request(f'{url}/rest/v1/{table}{params}',data=json.dumps(body,ensure_ascii=False).encode(),method=method,headers={'apikey':key,'Authorization':f'Bearer {key}','Content-Type':'application/json','Prefer':'resolution=merge-duplicates,return=minimal'})
    try:
        with urlopen(req,timeout=60) as r:return r.status
    except HTTPError as e: raise RuntimeError(f'{table}: HTTP {e.code}: {e.read().decode(errors="replace")[:500]}')
    except URLError as e: raise RuntimeError(f'{table}: {e}')

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--catalog',default='eroski_catalog.json');ap.add_argument('--apply',action='store_true');ap.add_argument('--complete-scan',action='store_true');ap.add_argument('--batch-size',type=int,default=BATCH);args=ap.parse_args()
    if args.complete_scan and not args.apply:raise SystemExit('--complete-scan requiere --apply')
    data=json.loads(Path(args.catalog).read_text(encoding='utf-8')); products=data.get('products',[])
    if not products or data.get('store_key')!='eroski':raise SystemExit('Catálogo inválido o vacío')
    if data.get('diagnostics') and any(x.get('status')!='ok' for x in data['diagnostics']):raise SystemExit('El catálogo contiene categorías con errores')
    now=datetime.now(timezone.utc).isoformat(); rows=[]
    for p in products:
        rows.append({'store_key':'eroski','provider_key':'scrapling','query_term':p.get('query_term'),'external_id':str(p['external_id']),'ean':p.get('ean'),'name':p['name'],'brand':p.get('brand'),'category':p.get('category'),'image_url':p.get('image_url'),'product_url':p.get('product_url'),'price':p.get('price'),'reference_price':p.get('reference_price'),'reference_format':p.get('reference_format'),'packaging':p.get('packaging'),'captured_at':p.get('captured_at') or now,'is_active':True,'raw':p.get('raw') or {},'updated_at':now})
    print(json.dumps({'mode':'apply' if args.apply else 'dry-run','products':len(rows),'batches':(len(rows)+args.batch_size-1)//args.batch_size,'complete_scan':args.complete_scan},ensure_ascii=False))
    if not args.apply:return
    url=os.environ.get('SUPABASE_URL','').rstrip('/');key=os.environ.get('SUPABASE_SERVICE_ROLE_KEY','')
    if not url or not key:raise SystemExit('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY')
    product_ids={};
    for i in range(0,len(rows),args.batch_size):
        batch=rows[i:i+args.batch_size];api(url,key,'store_catalog_products','POST',batch,'?on_conflict=store_key,external_id');print(f'productos {min(i+len(batch),len(rows))}/{len(rows)}',flush=True)
    # Resolve UUIDs through the public API in chunks, then add one history point per product.
    for i in range(0,len(rows),args.batch_size):
        ids=','.join('"'+p['external_id']+'"' for p in rows[i:i+args.batch_size]);req=Request(f'{url}/rest/v1/store_catalog_products?select=id,external_id&store_key=eq.eroski&external_id=in.({ids})',headers={'apikey':key,'Authorization':f'Bearer {key}'})
        with urlopen(req,timeout=60) as response: found=json.loads(response.read())
        product_ids.update({x['external_id']:x['id'] for x in found})
    history=[{'store_catalog_product_id':product_ids[p['external_id']],'store_key':'eroski','provider_key':'scrapling','price':p['price'],'reference_price':p['reference_price'],'reference_format':p['reference_format'],'captured_at':p['captured_at'] or now} for p in rows if p['external_id'] in product_ids]
    for i in range(0,len(history),args.batch_size):api(url,key,'store_catalog_price_history','POST',history[i:i+args.batch_size]);print(f'historial {min(i+len(history[i:i+args.batch_size]),len(history))}/{len(history)}',flush=True)
    if args.complete_scan:
        ids=list(product_ids);payload={'is_active':False,'updated_at':now};api(url,key,'store_catalog_products','PATCH',payload,'?store_key=eq.eroski&external_id=not.in.('+','.join('"'+x+'"' for x in ids)+')');print('productos ausentes marcados como inactivos')
    print('IMPORTACIÓN COMPLETADA')
if __name__=='__main__':main()
