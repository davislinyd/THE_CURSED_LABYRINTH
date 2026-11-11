"""Read Debug metrics through devicectl console when app-container copying is unavailable."""
import argparse,datetime,json,pathlib,queue,subprocess,threading,time
p=argparse.ArgumentParser()
p.add_argument('--device',required=True);p.add_argument('--build',required=True)
p.add_argument('--seconds',type=float,default=900);p.add_argument('--stop-at-serious',action='store_true')
args=p.parse_args();root=pathlib.Path(__file__).resolve().parents[1]
out=root/'build'/f'soak-console-{args.build}';out.mkdir(parents=True,exist_ok=True)
command=['xcrun','devicectl','device','process','launch','--device',args.device,'--terminate-existing','--console','com.davislinyd.thecursedlabyrinth','--','--ui-testing','--validate','--diagnostics-console']
process=subprocess.Popen(command,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,bufsize=1)
lines=queue.Queue()
def read():
    for line in process.stdout:lines.put(line)
threading.Thread(target=read,daemon=True).start()
started=time.monotonic();fresh=started;latest=None;hashes=[];samples=[]
result={'passed':False,'build':args.build,'started':datetime.datetime.now().astimezone().isoformat()}
with (out/'console.log').open('w') as log:
    while time.monotonic()-started<args.seconds+120:
        try:line=lines.get(timeout=5)
        except queue.Empty:
            if process.poll() is not None:result['failure']='App console ended';break
            if time.monotonic()-fresh>90:result['failure']='Metrics stopped advancing';break
            continue
        log.write(line);log.flush()
        if 'LABYRINTH_SAVE_HASHES ' in line:
            hashes.append(json.loads(line.split('LABYRINTH_SAVE_HASHES ',1)[1]))
        if 'LABYRINTH_METRICS ' not in line:continue
        data=json.loads(line.split('LABYRINTH_METRICS ',1)[1])
        if data['version']!=args.build:result['failure']='Unexpected build';break
        if latest and data['seconds']<=latest['seconds']:continue
        latest=data;fresh=time.monotonic();samples.append(data)
        (out/f'metrics-{int(data["seconds"]):04}.json').write_text(json.dumps(data,indent=2))
        print(json.dumps({k:data[k] for k in ['seconds','area','averageFPS','p95FrameMS','thermalState','quality','renderPixels']}),flush=True)
        if args.stop_at_serious and data['thermalState']>=2:
            result['failure']='Stopped at serious thermal state';break
        if data['seconds']>=args.seconds:
            result['passed']=not data['assetFailures'] and data['woodblockShader'] and data['validation']['completions']>0
            break
result.update(metrics=latest,samples=len(samples),saveHashesConsistent=bool(hashes) and all(h==hashes[0] for h in hashes),saveHashes=hashes)
result['finished']=datetime.datetime.now().astimezone().isoformat()
(out/'result.json').write_text(json.dumps(result,indent=2))
# Leave the test namespace at the title; no uninstall, container reset, or player save write.
subprocess.run(['xcrun','devicectl','--timeout','20','device','process','launch','--device',args.device,'--terminate-existing','com.davislinyd.thecursedlabyrinth','--','--ui-testing'],capture_output=True)
try:process.wait(timeout=5)
except subprocess.TimeoutExpired:process.terminate()
print(json.dumps({k:v for k,v in result.items() if k not in ['metrics','saveHashes']}),flush=True)
raise SystemExit(0 if result['passed'] else 1)
