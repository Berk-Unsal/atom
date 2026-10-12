"""Normal shipping build; no cap override or disposable source patch."""
import hashlib,json,pathlib,subprocess
HERE=pathlib.Path(__file__).resolve().parent;ROOT=HERE.parents[1];WORK=pathlib.Path('/tmp/atom-eight-cell-product-cap-promotion')
def main():
 with (WORK/'shipping-build.log').open('w') as out:subprocess.run(['docker','build','--platform','linux/arm64','--build-arg','VERSION='+(ROOT/'VERSION').read_text().strip(),'-t','atom:product-eight',str(ROOT)],check=True,stdout=out,stderr=subprocess.STDOUT)
 image=json.loads(subprocess.check_output(['docker','image','inspect','atom:product-eight'],text=True))[0]
 cid=subprocess.check_output(['docker','create',image['Id']],text=True).strip()
 try:subprocess.run(['docker','cp',cid+':/app/server',str(WORK/'server')],check=True)
 finally:subprocess.run(['docker','rm',cid],check=True,stdout=subprocess.DEVNULL)
 p=WORK/'server';meta=subprocess.check_output(['go','version','-m',str(p)],text=True);assert all(v in meta for v in ['go1.26.6','CGO_ENABLED=0','GOARCH=arm64','GOOS=linux'])
 value={'image_id':image['Id'],'binary_sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'VERSION':(ROOT/'VERSION').read_text().strip(),'build_metadata':meta,'source_sha256':{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in (ROOT/'backend-go').rglob('*.go') if not p.name.endswith('_test.go')},'audit_override':False,'normal_product_cap':8}
 (HERE/'shipping-build.json').write_text(json.dumps(value,indent=2)+'\n')
if __name__=='__main__':main()
