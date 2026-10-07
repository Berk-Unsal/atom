"""Compile metadata-only test with the shipping toolchain; measure in Profile A."""
import json,pathlib,subprocess
HERE=pathlib.Path(__file__).resolve().parent;ROOT=HERE.parents[1];WORK=pathlib.Path('/tmp/atom-bounded-followup-policy')
def main():
 dockerfile=WORK/'Saturation.Dockerfile';dockerfile.write_text('''FROM golang:1.26.6-alpine@sha256:3889b425f035be855a72fb4755265311293b6d414521f0a519d819df32222d83 AS build
WORKDIR /src
COPY backend-go/go.mod backend-go/go.sum ./
RUN go mod download
COPY backend-go/ ./
RUN CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go test -c -o /policy-tests .
FROM alpine:3.24@sha256:294b683cb724975bec92580e1e685676bd4b50bda910ddb8c51d4cabeaec77e6
COPY --from=build /policy-tests /policy-tests
ENV ATOM_POLICY_SATURATION=1
CMD ["/policy-tests","-test.run=^TestBoundedWorkflowSaturation$","-test.v"]
''')
 with (WORK/'saturation-build.log').open('w') as out:subprocess.run(['docker','build','--platform','linux/arm64','-f',str(dockerfile),'-t','atom:bounded-saturation',str(ROOT)],stdout=out,stderr=subprocess.STDOUT,check=True)
 image=json.loads(subprocess.check_output(['docker','image','inspect','atom:bounded-saturation'],text=True))[0]
 cid=subprocess.check_output(['docker','create','--name','atom-bounded-saturation','--cpus','2','--memory','4g','--memory-swap','4g',image['Id']],text=True).strip()
 try:
  inspect=json.loads(subprocess.check_output(['docker','inspect',cid],text=True))[0];(WORK/'saturation-inspect.json').write_text(json.dumps(inspect,indent=2)+'\n')
  with (WORK/'saturation.log').open('w') as out:result=subprocess.run(['docker','start','-a',cid],stdout=out,stderr=subprocess.STDOUT)
  state=json.loads(subprocess.check_output(['docker','inspect',cid],text=True))[0]['State'];assert result.returncode==0 and state['ExitCode']==0 and not state['OOMKilled']
  line=next(s for s in (WORK/'saturation.log').read_text().splitlines() if s.startswith('POLICY_SATURATION '));summary=json.loads(line.split(' ',1)[1]);summary.update({'image_id':image['Id'],'container_state':state,'profile':'A','cpus':2,'memory_bytes':4<<30,'CGO_ENABLED':'0'})
  assert summary['runtime']=='go1.26.6' and summary['GOOS']=='linux' and summary['GOARCH']=='arm64' and summary['workflows']==114688 and summary['heap_entries']==114688 and summary['clients']==4096
  (HERE/'saturation.json').write_text(json.dumps(summary,indent=2)+'\n')
 finally:subprocess.run(['docker','rm','-f',cid],stdout=subprocess.DEVNULL,check=True)
if __name__=='__main__':main()
